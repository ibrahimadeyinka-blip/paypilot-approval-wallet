ALTER TABLE public.agent_payment_requests ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS agent_payment_requests_idem_uidx
  ON public.agent_payment_requests (token_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Atomic, concurrency-safe submission of an agent payment request.
-- Locks the token row so simultaneous requests for one token are serialized
-- and cannot both pass the rolling 24h budget check.
-- Budget policy: pending_approval AND approved requests in the last 24h count
-- toward the $500 limit (pending requests reserve budget). Blocked/declined do not.
CREATE OR REPLACE FUNCTION public.submit_agent_payment(
  p_token_hash text,
  p_vendor_name text,
  p_merchant_handle text,
  p_amount_cents integer,
  p_currency text,
  p_description text,
  p_source_context text,
  p_idempotency_key text
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
  ELSIF p_currency <> 'USD' THEN
    v_reason := 'Only USD payments are supported.';
  ELSIF p_amount_cents > c_single_cap THEN
    v_reason := 'Amount exceeds the single transaction cap of $100.';
  ELSIF NOT (v_merchant = ANY (SELECT lower(m) FROM unnest(v_token.merchant_whitelist) m)) THEN
    v_reason := format('Merchant "%s" is not on the approved list.', v_merchant);
  ELSE
    SELECT COALESCE(sum(amount_cents), 0) INTO v_spent FROM agent_payment_requests
      WHERE token_id = v_token.id
        AND status IN ('pending_approval', 'approved')
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
    btrim(p_description), btrim(p_source_context),
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