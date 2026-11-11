ALTER TABLE public.agent_payment_requests
  ADD COLUMN IF NOT EXISTS funding_tx_hash text,
  ADD COLUMN IF NOT EXISTS funder_account_id text,
  ADD COLUMN IF NOT EXISTS refund_tx_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS agent_payment_requests_funding_tx_hash_key
  ON public.agent_payment_requests (funding_tx_hash) WHERE funding_tx_hash IS NOT NULL;

COMMENT ON COLUMN public.agent_payment_requests.funding_tx_hash IS 'NEAR testnet tx hash of the owner wallet deposit into escrow';
COMMENT ON COLUMN public.agent_payment_requests.funder_account_id IS 'Owner NEAR testnet account that funded the escrow deposit';
COMMENT ON COLUMN public.agent_payment_requests.refund_tx_hash IS 'NEAR testnet tx hash refunding the deposit to the funder (pending:* while in flight)';

CREATE OR REPLACE FUNCTION public.begin_agent_authorization(p_owner_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF v_req.funding_tx_hash IS NOT NULL AND v_req.refund_tx_hash IS NULL THEN
    RETURN jsonb_build_object('outcome', 'not_actionable', 'status', v_req.status,
      'reason', 'Your earlier NEAR deposit for this request has not been refunded yet. Try again in a minute.');
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
        funding_tx_hash = NULL, funder_account_id = NULL, refund_tx_hash = NULL,
        updated_at = now()
    WHERE id = v_req.id
    RETURNING * INTO v_req;

  RETURN jsonb_build_object('outcome', 'proceed', 'request_id', v_req.id,
    'attempt', v_req.authorization_attempt, 'amount_cents', v_req.amount_cents,
    'currency', v_req.currency, 'description', v_req.description, 'vendor_name', v_req.vendor_name);
END;
$function$;