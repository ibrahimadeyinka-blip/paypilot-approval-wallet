CREATE OR REPLACE FUNCTION public.agent_request_violation(p_req agent_payment_requests, p_token agent_tokens)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_spent integer;
BEGIN
  IF p_token.revoked THEN
    RETURN 'Agent token was revoked. Payment halted.';
  ELSIF p_token.expires_at <= now() THEN
    RETURN 'Agent token expired. Payment halted.';
  ELSIF p_req.currency <> 'NEAR' THEN
    RETURN 'Only NEAR payments are supported.';
  ELSIF p_req.amount_cents <= 0 OR p_req.amount_cents > p_token.single_cap_cents THEN
    RETURN format('Amount exceeds this token''s single transaction cap of %s NEAR.', to_char(p_token.single_cap_cents / 100.0, 'FM999999990.00'));
  ELSIF length(btrim(coalesce(p_req.source_context, ''))) < 10 THEN
    RETURN 'Source evidence is missing.';
  ELSIF cardinality(p_token.merchant_whitelist) > 0 AND NOT (lower(p_req.merchant_handle) = ANY (SELECT lower(m) FROM unnest(p_token.merchant_whitelist) m)) THEN
    RETURN format('Merchant "%s" is no longer on the approved list.', p_req.merchant_handle);
  END IF;
  SELECT COALESCE(sum(amount_cents), 0) INTO v_spent FROM agent_payment_requests
    WHERE token_id = p_token.id AND id <> p_req.id
      AND status = ANY (public.agent_budget_statuses())
      AND created_at > now() - interval '24 hours';
  IF v_spent + p_req.amount_cents > p_token.daily_cap_cents THEN
    RETURN format('Would exceed this token''s 24h budget of %s NEAR.', to_char(p_token.daily_cap_cents / 100.0, 'FM999999990.00'));
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_agent_payment(p_token_hash text, p_vendor_name text, p_merchant_handle text, p_amount_cents integer, p_currency text, p_description text, p_source_context text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token agent_tokens%ROWTYPE;
  v_existing agent_payment_requests%ROWTYPE;
  v_spent integer;
  v_reason text;
  v_id uuid;
  v_merchant text := lower(btrim(p_merchant_handle));
BEGIN
  SELECT * INTO v_token FROM agent_tokens WHERE token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'unauthorized', 'reason', 'Unknown agent token');
  END IF;
  IF v_token.revoked THEN
    RETURN jsonb_build_object('outcome', 'unauthorized', 'reason', 'Agent token has been revoked.');
  END IF;
  IF v_token.expires_at <= now() THEN
    RETURN jsonb_build_object('outcome', 'unauthorized', 'reason', 'Agent token has expired.');
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM agent_payment_requests
      WHERE token_id = v_token.id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      IF v_existing.amount_cents <> p_amount_cents OR v_existing.merchant_handle <> v_merchant THEN
        RETURN jsonb_build_object('outcome', 'idempotency_conflict',
          'reason', 'Idempotency key was already used for a different request.');
      END IF;
      RETURN jsonb_build_object('outcome', 'replayed', 'request_id', v_existing.id,
        'status', v_existing.status, 'reason', v_existing.block_reason);
    END IF;
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    v_reason := 'Amount must be a positive whole number of cents.';
  ELSIF length(btrim(coalesce(p_source_context, ''))) < 10 THEN
    v_reason := 'Source evidence is required: quote the text that justifies this payment.';
  ELSIF p_currency <> 'NEAR' THEN
    v_reason := 'Only NEAR payments are supported.';
  ELSIF p_amount_cents > v_token.single_cap_cents THEN
    v_reason := format('Amount exceeds this token''s single transaction cap of %s NEAR.', to_char(v_token.single_cap_cents / 100.0, 'FM999999990.00'));
  ELSIF cardinality(v_token.merchant_whitelist) > 0 AND NOT (v_merchant = ANY (SELECT lower(m) FROM unnest(v_token.merchant_whitelist) m)) THEN
    v_reason := format('Merchant "%s" is not on the approved list.', v_merchant);
  ELSE
    SELECT COALESCE(sum(amount_cents), 0) INTO v_spent FROM agent_payment_requests
      WHERE token_id = v_token.id
        AND status = ANY (public.agent_budget_statuses())
        AND created_at > now() - interval '24 hours';
    IF v_spent + p_amount_cents > v_token.daily_cap_cents THEN
      v_reason := format('Would exceed this token''s 24h budget of %s NEAR.', to_char(v_token.daily_cap_cents / 100.0, 'FM999999990.00'));
    END IF;
  END IF;

  INSERT INTO agent_payment_requests (
    token_id, owner_id, vendor_name, merchant_handle, amount_cents, currency,
    description, source_context, status, block_reason, idempotency_key
  ) VALUES (
    v_token.id, v_token.owner_id, btrim(p_vendor_name), v_merchant, GREATEST(p_amount_cents, 1), p_currency,
    btrim(p_description), btrim(coalesce(p_source_context, '')),
    CASE WHEN v_reason IS NULL THEN 'pending_approval' ELSE 'blocked' END,
    v_reason, p_idempotency_key
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'outcome', CASE WHEN v_reason IS NULL THEN 'pending_approval' ELSE 'blocked' END,
    'request_id', v_id,
    'status', CASE WHEN v_reason IS NULL THEN 'pending_approval' ELSE 'blocked' END,
    'reason', v_reason);
END;
$function$;

CREATE OR REPLACE FUNCTION public.payrail_setup_checks()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE t public.agent_tokens; r public.agent_payment_requests; missing text[]; blank_ok boolean; restricted_ok boolean; cap_ok boolean;
BEGIN
 SELECT array_agg(name) INTO missing FROM unnest(ARRAY['profiles','agent_tokens','agent_payment_requests','agent_history','delivery_links','deliverables','agent_drafts','agent_ai_state']) name WHERE to_regclass('public.'||name) IS NULL;
 t := jsonb_populate_record(NULL::public.agent_tokens, jsonb_build_object('id','00000000-0000-0000-0000-000000000001','revoked',false,'expires_at',now()+interval '7 days','single_cap_cents',1000,'daily_cap_cents',6000,'merchant_whitelist','[]'::jsonb));
 r := jsonb_populate_record(NULL::public.agent_payment_requests, jsonb_build_object('id','00000000-0000-0000-0000-000000000002','token_id',t.id,'currency','NEAR','amount_cents',1000,'source_context','Owner requests a blue logo','merchant_handle','alex.testnet'));
 blank_ok := public.agent_request_violation(r,t) IS NULL;
 restricted_ok := public.agent_request_violation(r,jsonb_populate_record(t,'{"merchant_whitelist":["other.testnet"]}')) LIKE '%approved list%';
 cap_ok := public.agent_request_violation(jsonb_populate_record(r,'{"amount_cents":1001}'),t) LIKE '%single transaction cap%';
 RETURN jsonb_build_object('schema_ready', missing IS NULL,'missing_tables',coalesce(to_jsonb(missing),'[]'::jsonb),'blank_payees_allowed',blank_ok,'restricted_payees_blocked',restricted_ok,'cap_enforced',cap_ok,'submission_blank_guard',position('cardinality(v_token.merchant_whitelist) > 0' IN pg_get_functiondef('public.submit_agent_payment(text,text,text,integer,text,text,text,text)'::regprocedure)) > 0);
END; $function$;

ALTER TABLE public.agent_payment_requests ALTER COLUMN currency SET DEFAULT 'NEAR';