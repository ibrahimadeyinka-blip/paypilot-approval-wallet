-- Slice 2: owner approval + PayPal Sandbox authorization holds
ALTER TABLE public.agent_payment_requests
  ADD COLUMN IF NOT EXISTS authorization_attempt integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS decided_by uuid,
  ADD COLUMN IF NOT EXISTS paypal_order_id text,
  ADD COLUMN IF NOT EXISTS paypal_approve_url text,
  ADD COLUMN IF NOT EXISTS paypal_authorization_id text,
  ADD COLUMN IF NOT EXISTS paypal_authorization_status text,
  ADD COLUMN IF NOT EXISTS paypal_authorization_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS authorization_error text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.agent_payment_requests DROP CONSTRAINT IF EXISTS agent_payment_requests_status_check;
ALTER TABLE public.agent_payment_requests ADD CONSTRAINT agent_payment_requests_status_check
  CHECK (status IN ('pending_approval', 'authorizing', 'authorized', 'authorization_failed', 'approved', 'declined', 'blocked'));

CREATE UNIQUE INDEX IF NOT EXISTS agent_payment_requests_paypal_order_uidx
  ON public.agent_payment_requests (paypal_order_id) WHERE paypal_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS agent_payment_requests_paypal_auth_uidx
  ON public.agent_payment_requests (paypal_authorization_id) WHERE paypal_authorization_id IS NOT NULL;

COMMENT ON COLUMN public.agent_payment_requests.source_context IS
  'Agent-provided evidence quoted verbatim. Not verified proof.';

-- Statuses that reserve budget. Used by submission and approval re-checks.
CREATE OR REPLACE FUNCTION public.agent_budget_statuses()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT ARRAY['pending_approval', 'authorizing', 'authorized', 'approved']::text[]
$$;

-- Re-checks every safeguard for an existing request. Returns a reason or NULL.
CREATE OR REPLACE FUNCTION public.agent_request_violation(p_req public.agent_payment_requests, p_token public.agent_tokens)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_spent integer;
BEGIN
  IF p_token.revoked THEN
    RETURN 'Agent token was revoked. Payment halted.';
  ELSIF p_token.expires_at <= now() THEN
    RETURN 'Agent token expired. Payment halted.';
  ELSIF p_req.currency <> 'USD' THEN
    RETURN 'Only USD payments are supported.';
  ELSIF p_req.amount_cents <= 0 OR p_req.amount_cents > 10000 THEN
    RETURN 'Amount exceeds the single transaction cap of $100.';
  ELSIF length(btrim(coalesce(p_req.source_context, ''))) < 10 THEN
    RETURN 'Source evidence is missing.';
  ELSIF NOT (lower(p_req.merchant_handle) = ANY (SELECT lower(m) FROM unnest(p_token.merchant_whitelist) m)) THEN
    RETURN format('Merchant "%s" is no longer on the approved list.', p_req.merchant_handle);
  END IF;
  SELECT COALESCE(sum(amount_cents), 0) INTO v_spent FROM agent_payment_requests
    WHERE token_id = p_token.id
      AND id <> p_req.id
      AND status = ANY (public.agent_budget_statuses())
      AND created_at > now() - interval '24 hours';
  IF v_spent + p_req.amount_cents > 50000 THEN
    RETURN 'Would exceed the daily budget of $500.';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.agent_request_violation(public.agent_payment_requests, public.agent_tokens) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_request_violation(public.agent_payment_requests, public.agent_tokens) TO service_role;

-- Submission: same as before, plus source evidence required and new budget statuses.
CREATE OR REPLACE FUNCTION public.submit_agent_payment(
  p_token_hash text, p_vendor_name text, p_merchant_handle text, p_amount_cents integer,
  p_currency text, p_description text, p_source_context text, p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_single_cap constant integer := 10000;
  c_daily_cap constant integer := 50000;
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
  ELSIF p_currency <> 'USD' THEN
    v_reason := 'Only USD payments are supported.';
  ELSIF p_amount_cents > c_single_cap THEN
    v_reason := 'Amount exceeds the single transaction cap of $100.';
  ELSIF NOT (v_merchant = ANY (SELECT lower(m) FROM unnest(v_token.merchant_whitelist) m)) THEN
    v_reason := format('Merchant "%s" is not on the approved list.', v_merchant);
  ELSE
    SELECT COALESCE(sum(amount_cents), 0) INTO v_spent FROM agent_payment_requests
      WHERE token_id = v_token.id
        AND status = ANY (public.agent_budget_statuses())
        AND created_at > now() - interval '24 hours';
    IF v_spent + p_amount_cents > c_daily_cap THEN
      v_reason := 'Would exceed the daily budget of $500.';
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
$$;
REVOKE EXECUTE ON FUNCTION public.submit_agent_payment(text, text, text, integer, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_agent_payment(text, text, text, integer, text, text, text, text) TO service_role;

-- Step 1 of approval: owner approves; re-check safeguards and reserve an authorization attempt.
CREATE OR REPLACE FUNCTION public.begin_agent_authorization(p_owner_id uuid, p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_id uuid;
  v_token agent_tokens%ROWTYPE;
  v_req agent_payment_requests%ROWTYPE;
  v_reason text;
BEGIN
  SELECT token_id INTO v_token_id FROM agent_payment_requests WHERE id = p_request_id AND owner_id = p_owner_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;
  -- Lock order: token, then request (matches submission, which locks the token).
  SELECT * INTO v_token FROM agent_tokens WHERE id = v_token_id FOR UPDATE;
  SELECT * INTO v_req FROM agent_payment_requests WHERE id = p_request_id FOR UPDATE;

  IF v_req.status = 'authorizing' THEN
    RETURN jsonb_build_object('outcome', 'in_progress', 'request_id', v_req.id,
      'attempt', v_req.authorization_attempt, 'order_id', v_req.paypal_order_id,
      'approve_url', v_req.paypal_approve_url, 'amount_cents', v_req.amount_cents,
      'currency', v_req.currency, 'description', v_req.description, 'vendor_name', v_req.vendor_name);
  ELSIF v_req.status IN ('authorized', 'approved') THEN
    RETURN jsonb_build_object('outcome', 'already_authorized', 'transaction_id', v_req.transaction_id);
  ELSIF v_req.status NOT IN ('pending_approval', 'authorization_failed') THEN
    RETURN jsonb_build_object('outcome', 'not_actionable', 'status', v_req.status, 'reason', v_req.block_reason);
  END IF;

  v_reason := public.agent_request_violation(v_req, v_token);
  IF v_reason IS NOT NULL THEN
    UPDATE agent_payment_requests
      SET status = 'blocked', block_reason = v_reason, decided_at = now(), decided_by = p_owner_id, updated_at = now()
      WHERE id = v_req.id;
    RETURN jsonb_build_object('outcome', 'blocked', 'reason', v_reason);
  END IF;

  UPDATE agent_payment_requests
    SET status = 'authorizing',
        authorization_attempt = authorization_attempt + 1,
        approved_at = now(), decided_at = now(), decided_by = p_owner_id,
        paypal_order_id = NULL, paypal_approve_url = NULL, authorization_error = NULL,
        updated_at = now()
    WHERE id = v_req.id
    RETURNING * INTO v_req;

  RETURN jsonb_build_object('outcome', 'proceed', 'request_id', v_req.id,
    'attempt', v_req.authorization_attempt, 'amount_cents', v_req.amount_cents,
    'currency', v_req.currency, 'description', v_req.description, 'vendor_name', v_req.vendor_name);
END;
$$;

-- Step 2: remember the PayPal order created for this attempt.
CREATE OR REPLACE FUNCTION public.attach_agent_paypal_order(p_request_id uuid, p_attempt integer, p_order_id text, p_approve_url text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE agent_payment_requests
    SET paypal_order_id = p_order_id, paypal_approve_url = p_approve_url, updated_at = now()
    WHERE id = p_request_id AND status = 'authorizing' AND authorization_attempt = p_attempt
      AND (paypal_order_id IS NULL OR paypal_order_id = p_order_id);
  RETURN FOUND;
END;
$$;

-- Mark an attempt as failed (safe: no funds held). Budget reservation is released.
CREATE OR REPLACE FUNCTION public.fail_agent_authorization(p_request_id uuid, p_attempt integer, p_error text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE agent_payment_requests
    SET status = 'authorization_failed', authorization_error = left(p_error, 500), updated_at = now()
    WHERE id = p_request_id AND status = 'authorizing' AND authorization_attempt = p_attempt;
  RETURN FOUND;
END;
$$;

-- Step 3 pre-check: re-run safeguards right before asking PayPal to place the hold.
CREATE OR REPLACE FUNCTION public.check_agent_authorization(p_request_id uuid, p_owner_id uuid, p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req_id uuid;
  v_token_id uuid;
  v_token agent_tokens%ROWTYPE;
  v_req agent_payment_requests%ROWTYPE;
  v_reason text;
BEGIN
  IF p_order_id IS NOT NULL THEN
    SELECT id, token_id INTO v_req_id, v_token_id FROM agent_payment_requests WHERE paypal_order_id = p_order_id;
  ELSE
    SELECT id, token_id INTO v_req_id, v_token_id FROM agent_payment_requests WHERE id = p_request_id AND owner_id = p_owner_id;
  END IF;
  IF v_req_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;
  SELECT * INTO v_token FROM agent_tokens WHERE id = v_token_id FOR UPDATE;
  SELECT * INTO v_req FROM agent_payment_requests WHERE id = v_req_id FOR UPDATE;

  IF v_req.status IN ('authorized', 'approved') THEN
    RETURN jsonb_build_object('outcome', 'already_authorized', 'request_id', v_req.id, 'transaction_id', v_req.transaction_id);
  ELSIF v_req.status <> 'authorizing' THEN
    RETURN jsonb_build_object('outcome', 'not_actionable', 'request_id', v_req.id, 'status', v_req.status,
      'reason', COALESCE(v_req.authorization_error, v_req.block_reason));
  ELSIF v_req.paypal_order_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'no_order', 'request_id', v_req.id, 'attempt', v_req.authorization_attempt);
  END IF;

  v_reason := public.agent_request_violation(v_req, v_token);
  IF v_reason IS NOT NULL THEN
    UPDATE agent_payment_requests
      SET status = 'blocked', block_reason = v_reason, updated_at = now()
      WHERE id = v_req.id;
    RETURN jsonb_build_object('outcome', 'blocked', 'request_id', v_req.id, 'reason', v_reason);
  END IF;

  RETURN jsonb_build_object('outcome', 'proceed', 'request_id', v_req.id,
    'attempt', v_req.authorization_attempt, 'order_id', v_req.paypal_order_id);
END;
$$;

-- Step 3 result: PayPal confirmed the hold. Idempotent per authorization id.
CREATE OR REPLACE FUNCTION public.record_agent_authorization(
  p_request_id uuid, p_attempt integer, p_order_id text,
  p_authorization_id text, p_authorization_status text, p_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req agent_payment_requests%ROWTYPE;
  v_txn_id uuid;
BEGIN
  SELECT * INTO v_req FROM agent_payment_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'conflict', 'status', 'missing');
  END IF;
  IF v_req.status = 'authorized' AND v_req.paypal_authorization_id = p_authorization_id THEN
    RETURN jsonb_build_object('outcome', 'already_authorized', 'transaction_id', v_req.transaction_id);
  END IF;
  IF v_req.status <> 'authorizing' OR v_req.authorization_attempt <> p_attempt OR v_req.paypal_order_id IS DISTINCT FROM p_order_id THEN
    RETURN jsonb_build_object('outcome', 'conflict', 'status', v_req.status);
  END IF;

  INSERT INTO transactions (
    user_id, vendor_name, vendor_handle, description, amount_cents, currency, status,
    ai_request, ai_reasoning, source_text, proof_verified
  ) VALUES (
    v_req.owner_id, v_req.vendor_name, v_req.merchant_handle, v_req.description, v_req.amount_cents, v_req.currency,
    'authorized', v_req.description,
    'Owner approved the agent request; PayPal Sandbox authorization placed.',
    v_req.source_context, false
  ) RETURNING id INTO v_txn_id;

  INSERT INTO escrow_events (transaction_id, event_type, amount_cents, detail)
  VALUES (v_txn_id, 'authorized', v_req.amount_cents,
    format('PayPal Sandbox authorization %s placed (order %s). Funds are held, not captured.', p_authorization_id, p_order_id));

  INSERT INTO audit_timeline (transaction_id, step, actor, title, detail, metadata) VALUES
    (v_txn_id, 'source_evidence', 'agent', 'Agent-provided evidence', v_req.source_context,
      jsonb_build_object('request_id', v_req.id, 'token_id', v_req.token_id, 'verified', false)),
    (v_txn_id, 'owner_approval', 'user', 'Owner approved the request', NULL,
      jsonb_build_object('request_id', v_req.id, 'approved_at', v_req.approved_at, 'decided_by', v_req.decided_by)),
    (v_txn_id, 'paypal_authorize', 'paypal', 'PayPal Sandbox authorization placed',
      'Funds are on hold. They are captured only after the delivery is reviewed.',
      jsonb_build_object('amount_cents', v_req.amount_cents, 'paypal_order_id', p_order_id,
        'paypal_authorization_id', p_authorization_id, 'paypal_status', p_authorization_status,
        'expires_at', p_expires_at));

  UPDATE agent_payment_requests
    SET status = 'authorized', transaction_id = v_txn_id,
        paypal_authorization_id = p_authorization_id,
        paypal_authorization_status = p_authorization_status,
        paypal_authorization_expires_at = p_expires_at,
        authorization_error = NULL, updated_at = now()
    WHERE id = v_req.id;

  RETURN jsonb_build_object('outcome', 'authorized', 'transaction_id', v_txn_id);
END;
$$;

-- Owner declines. Allowed before a hold is placed.
CREATE OR REPLACE FUNCTION public.decline_agent_payment(p_request_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req agent_payment_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM agent_payment_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Payment request not found';
  END IF;
  IF v_req.status NOT IN ('pending_approval', 'authorizing', 'authorization_failed') THEN
    RETURN v_req.status;
  END IF;
  UPDATE agent_payment_requests
    SET status = 'declined', decided_at = now(), decided_by = auth.uid(), updated_at = now()
    WHERE id = p_request_id;
  RETURN 'declined';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.begin_agent_authorization(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.attach_agent_paypal_order(uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fail_agent_authorization(uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_agent_authorization(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_agent_authorization(uuid, integer, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_agent_authorization(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.attach_agent_paypal_order(uuid, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_agent_authorization(uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_agent_authorization(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_agent_authorization(uuid, integer, text, text, text, timestamptz) TO service_role;
REVOKE EXECUTE ON FUNCTION public.decline_agent_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_agent_payment(uuid) TO authenticated;

-- The old one-click approval marked funds as held without calling PayPal. Retire it.
REVOKE EXECUTE ON FUNCTION public.decide_agent_payment(uuid, boolean) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.decide_agent_payment(uuid, boolean) IS 'DEPRECATED: replaced by begin/check/record_agent_authorization (real PayPal Sandbox authorization) and decline_agent_payment';
