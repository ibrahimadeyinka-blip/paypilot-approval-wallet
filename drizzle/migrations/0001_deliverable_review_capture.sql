-- Slice 3: merchant upload links, AI review of deliverables, conditional PayPal capture / void.

ALTER TABLE public.agent_payment_requests
  ADD COLUMN IF NOT EXISTS delivery_requirements text,
  ADD COLUMN IF NOT EXISTS capture_attempt integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS void_attempt integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paypal_capture_id text,
  ADD COLUMN IF NOT EXISTS paypal_capture_status text,
  ADD COLUMN IF NOT EXISTS captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS captured_by text,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS settlement_error text;

ALTER TABLE public.agent_payment_requests DROP CONSTRAINT IF EXISTS agent_payment_requests_status_check;
ALTER TABLE public.agent_payment_requests ADD CONSTRAINT agent_payment_requests_status_check
  CHECK (status IN ('pending_approval', 'authorizing', 'authorized', 'authorization_failed', 'approved', 'declined', 'blocked',
                    'capturing', 'captured', 'capture_failed', 'voiding', 'voided'));

CREATE OR REPLACE FUNCTION public.agent_budget_statuses()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT ARRAY['pending_approval', 'authorizing', 'authorized', 'approved', 'capturing', 'captured', 'voiding']::text[]
$$;

-- One-time upload links for the merchant (stored as hashes only).
CREATE TABLE public.delivery_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.agent_payment_requests(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.delivery_links TO authenticated;
GRANT ALL ON public.delivery_links TO service_role;
ALTER TABLE public.delivery_links ENABLE ROW LEVEL SECURITY;
CREATE INDEX delivery_links_request_idx ON public.delivery_links (request_id, created_at DESC);
CREATE POLICY "select_own_delivery_links" ON public.delivery_links FOR SELECT TO authenticated USING (auth.uid() = owner_id);

-- Deliverables: link to the agent request and keep review details.
ALTER TABLE public.deliverables
  ADD COLUMN IF NOT EXISTS request_id uuid REFERENCES public.agent_payment_requests(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS link_id uuid REFERENCES public.delivery_links(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS uploaded_by text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_confidence numeric,
  ADD COLUMN IF NOT EXISTS ai_model text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
CREATE INDEX IF NOT EXISTS deliverables_request_idx ON public.deliverables (request_id, uploaded_at DESC);
COMMENT ON COLUMN public.deliverables.ai_verdict IS 'pending | approved | rejected | uncertain. Written only by the server review.';

-- Review results decide whether capture may happen, so only the server may write deliverables.
DROP POLICY IF EXISTS "insert_own_deliverables" ON public.deliverables;
DROP POLICY IF EXISTS "update_own_deliverables" ON public.deliverables;
DROP POLICY IF EXISTS "delete_own_deliverables" ON public.deliverables;
REVOKE INSERT, UPDATE, DELETE ON public.deliverables FROM authenticated, anon;
CREATE POLICY "select_own_request_deliverables" ON public.deliverables FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agent_payment_requests r WHERE r.id = deliverables.request_id AND r.owner_id = auth.uid()));

-- Owner creates an upload link for a request whose funds are on hold.
CREATE OR REPLACE FUNCTION public.create_delivery_link(p_request_id uuid, p_token_hash text, p_requirements text, p_days integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req agent_payment_requests%ROWTYPE;
  v_id uuid;
  v_expires timestamptz := now() + make_interval(days => LEAST(GREATEST(COALESCE(p_days, 7), 1), 30));
BEGIN
  SELECT * INTO v_req FROM agent_payment_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Payment request not found';
  END IF;
  IF v_req.status <> 'authorized' THEN
    RAISE EXCEPTION 'Upload links can only be created while funds are on hold';
  END IF;
  IF length(coalesce(p_token_hash, '')) <> 64 THEN
    RAISE EXCEPTION 'Invalid link token';
  END IF;
  UPDATE delivery_links SET revoked = true WHERE request_id = p_request_id AND used_at IS NULL AND NOT revoked;
  UPDATE agent_payment_requests
    SET delivery_requirements = NULLIF(left(btrim(coalesce(p_requirements, '')), 2000), ''), updated_at = now()
    WHERE id = p_request_id;
  INSERT INTO delivery_links (request_id, owner_id, token_hash, expires_at)
    VALUES (p_request_id, v_req.owner_id, p_token_hash, v_expires) RETURNING id INTO v_id;
  RETURN jsonb_build_object('link_id', v_id, 'expires_at', v_expires);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_delivery_link(uuid, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_delivery_link(uuid, text, text, integer) TO authenticated;

-- Public page info for a link (no owner details).
CREATE OR REPLACE FUNCTION public.get_delivery_link_info(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link delivery_links%ROWTYPE;
  v_req agent_payment_requests%ROWTYPE;
  v_state text;
BEGIN
  SELECT * INTO v_link FROM delivery_links WHERE token_hash = p_token_hash;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'not_found');
  END IF;
  SELECT * INTO v_req FROM agent_payment_requests WHERE id = v_link.request_id;
  v_state := CASE
    WHEN v_link.revoked THEN 'revoked'
    WHEN v_link.used_at IS NOT NULL THEN 'used'
    WHEN v_link.expires_at <= now() THEN 'expired'
    WHEN v_req.status <> 'authorized' THEN 'closed'
    ELSE 'active' END;
  RETURN jsonb_build_object('state', v_state, 'vendor_name', v_req.vendor_name, 'description', v_req.description,
    'requirements', v_req.delivery_requirements, 'amount_cents', v_req.amount_cents, 'currency', v_req.currency,
    'expires_at', v_link.expires_at);
END;
$$;

-- Reserve a link for one upload. Locks the link so two uploads can't both use it.
CREATE OR REPLACE FUNCTION public.claim_delivery_link(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link delivery_links%ROWTYPE;
  v_req agent_payment_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_link FROM delivery_links WHERE token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'not_found'); END IF;
  IF v_link.revoked THEN RETURN jsonb_build_object('outcome', 'revoked'); END IF;
  IF v_link.used_at IS NOT NULL THEN RETURN jsonb_build_object('outcome', 'used'); END IF;
  IF v_link.expires_at <= now() THEN RETURN jsonb_build_object('outcome', 'expired'); END IF;
  SELECT * INTO v_req FROM agent_payment_requests WHERE id = v_link.request_id;
  IF v_req.status <> 'authorized' THEN RETURN jsonb_build_object('outcome', 'closed'); END IF;
  UPDATE delivery_links SET used_at = now() WHERE id = v_link.id;
  RETURN jsonb_build_object('outcome', 'claimed', 'link_id', v_link.id, 'request_id', v_req.id,
    'owner_id', v_req.owner_id, 'vendor_name', v_req.vendor_name, 'description', v_req.description,
    'requirements', v_req.delivery_requirements, 'amount_cents', v_req.amount_cents, 'currency', v_req.currency,
    'source_context', v_req.source_context);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_delivery_link(p_link_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE delivery_links SET used_at = NULL WHERE id = p_link_id;
$$;

CREATE OR REPLACE FUNCTION public.record_deliverable(
  p_link_id uuid, p_request_id uuid, p_deliverable_id uuid, p_storage_path text, p_filename text, p_mime text, p_size integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req agent_payment_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM agent_payment_requests WHERE id = p_request_id;
  IF NOT FOUND OR v_req.transaction_id IS NULL THEN
    RAISE EXCEPTION 'Request has no held payment';
  END IF;
  INSERT INTO deliverables (id, transaction_id, request_id, link_id, filename, storage_path, mime_type, size_bytes, uploaded_by, ai_verdict)
    VALUES (p_deliverable_id, v_req.transaction_id, p_request_id, p_link_id, p_filename, p_storage_path, p_mime, p_size,
            'merchant (upload link)', 'pending');
  INSERT INTO audit_timeline (transaction_id, step, actor, title, detail, metadata)
    VALUES (v_req.transaction_id, 'deliverable_uploaded', 'merchant', 'Deliverable uploaded', p_filename,
      jsonb_build_object('request_id', p_request_id, 'deliverable_id', p_deliverable_id, 'link_id', p_link_id,
        'mime_type', p_mime, 'size_bytes', p_size));
  RETURN p_deliverable_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_deliverable_review(
  p_deliverable_id uuid, p_verdict text, p_summary text, p_confidence numeric, p_model text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_d deliverables%ROWTYPE;
BEGIN
  IF p_verdict NOT IN ('approved', 'rejected', 'uncertain') THEN
    RAISE EXCEPTION 'Invalid verdict';
  END IF;
  UPDATE deliverables
    SET ai_verdict = p_verdict, ai_notes = left(p_summary, 2000), ai_confidence = p_confidence, ai_model = p_model, reviewed_at = now()
    WHERE id = p_deliverable_id
    RETURNING * INTO v_d;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deliverable not found'; END IF;
  INSERT INTO audit_timeline (transaction_id, step, actor, title, detail, metadata)
    VALUES (v_d.transaction_id, 'vision_review', 'ai', format('AI review: %s', p_verdict), left(p_summary, 2000),
      jsonb_build_object('deliverable_id', v_d.id, 'request_id', v_d.request_id, 'verdict', p_verdict,
        'confidence', p_confidence, 'model', p_model));
END;
$$;

-- Capture: lock the request, re-check everything, reserve a capture attempt.
-- p_actor 'auto' (after an approved AI review) or 'owner' (owner accepts work after an uncertain/approved review).
CREATE OR REPLACE FUNCTION public.begin_agent_capture(p_request_id uuid, p_actor text, p_owner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req agent_payment_requests%ROWTYPE;
  v_token agent_tokens%ROWTYPE;
  v_verdict text;
  v_reason text;
BEGIN
  SELECT * INTO v_req FROM agent_payment_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR (p_owner_id IS NOT NULL AND v_req.owner_id IS DISTINCT FROM p_owner_id) THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;
  IF v_req.status = 'captured' THEN
    RETURN jsonb_build_object('outcome', 'already_captured', 'capture_id', v_req.paypal_capture_id);
  END IF;
  IF v_req.status = 'capturing' THEN
    RETURN jsonb_build_object('outcome', 'proceed', 'attempt', v_req.capture_attempt,
      'authorization_id', v_req.paypal_authorization_id, 'retry', true);
  END IF;
  IF v_req.status <> 'authorized' THEN
    RETURN jsonb_build_object('outcome', 'not_allowed', 'reason', format('Payment is %s, not on hold.', replace(v_req.status, '_', ' ')));
  END IF;
  IF v_req.paypal_authorization_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'not_allowed', 'reason', 'No PayPal authorization is recorded for this payment.');
  END IF;

  SELECT ai_verdict INTO v_verdict FROM deliverables WHERE request_id = p_request_id ORDER BY uploaded_at DESC LIMIT 1;
  SELECT * INTO v_token FROM agent_tokens WHERE id = v_req.token_id;

  IF v_verdict IS NULL THEN
    v_reason := 'No deliverable has been uploaded yet.';
  ELSIF p_actor = 'auto' AND v_verdict <> 'approved' THEN
    v_reason := format('The latest review is %s, so payment is not released automatically.', v_verdict);
  ELSIF p_actor = 'owner' AND v_verdict NOT IN ('approved', 'uncertain') THEN
    v_reason := format('The latest review is %s. Ask for a new upload or release the hold.', v_verdict);
  ELSIF p_actor NOT IN ('auto', 'owner') THEN
    v_reason := 'Unknown actor.';
  ELSIF p_actor = 'auto' AND v_token.revoked THEN
    v_reason := 'The agent token was revoked, so payment is not released automatically.';
  END IF;
  IF v_reason IS NOT NULL THEN
    RETURN jsonb_build_object('outcome', 'not_allowed', 'reason', v_reason);
  END IF;

  IF v_req.paypal_authorization_expires_at IS NOT NULL AND v_req.paypal_authorization_expires_at <= now() THEN
    UPDATE agent_payment_requests
      SET status = 'capture_failed', settlement_error = 'The PayPal authorization expired before capture. No funds were taken.', updated_at = now()
      WHERE id = p_request_id;
    RETURN jsonb_build_object('outcome', 'expired', 'reason', 'The PayPal authorization expired before capture. No funds were taken.');
  END IF;

  UPDATE agent_payment_requests
    SET status = 'capturing', capture_attempt = capture_attempt + 1, captured_by = p_actor, settlement_error = NULL, updated_at = now()
    WHERE id = p_request_id
    RETURNING * INTO v_req;
  RETURN jsonb_build_object('outcome', 'proceed', 'attempt', v_req.capture_attempt,
    'authorization_id', v_req.paypal_authorization_id, 'retry', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_agent_capture(p_request_id uuid, p_attempt integer, p_capture_id text, p_capture_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req agent_payment_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM agent_payment_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'conflict'); END IF;
  IF v_req.status = 'captured' THEN RETURN jsonb_build_object('outcome', 'already_captured'); END IF;
  IF v_req.status <> 'capturing' OR v_req.capture_attempt <> p_attempt THEN
    RETURN jsonb_build_object('outcome', 'conflict', 'status', v_req.status);
  END IF;
  UPDATE agent_payment_requests
    SET status = 'captured', paypal_capture_id = p_capture_id, paypal_capture_status = p_capture_status,
        captured_at = now(), settlement_error = NULL, updated_at = now()
    WHERE id = p_request_id;
  UPDATE transactions SET status = 'captured', proof_verified = true, updated_at = now() WHERE id = v_req.transaction_id;
  INSERT INTO escrow_events (transaction_id, event_type, amount_cents, detail)
    VALUES (v_req.transaction_id, 'captured', v_req.amount_cents,
      format('PayPal Sandbox capture %s (%s).', coalesce(p_capture_id, 'id unavailable'), coalesce(p_capture_status, 'unknown')));
  INSERT INTO audit_timeline (transaction_id, step, actor, title, detail, metadata)
    VALUES (v_req.transaction_id, 'paypal_capture', 'paypal', 'Payment captured',
      CASE WHEN v_req.captured_by = 'owner' THEN 'Owner accepted the work; PayPal captured the held funds.'
           ELSE 'AI review approved the work; PayPal captured the held funds.' END,
      jsonb_build_object('request_id', p_request_id, 'capture_id', p_capture_id, 'capture_status', p_capture_status,
        'captured_by', v_req.captured_by, 'amount_cents', v_req.amount_cents));
  RETURN jsonb_build_object('outcome', 'captured');
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_agent_capture(p_request_id uuid, p_attempt integer, p_error text, p_terminal boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req agent_payment_requests%ROWTYPE;
BEGIN
  UPDATE agent_payment_requests
    SET status = CASE WHEN p_terminal THEN 'capture_failed' ELSE 'authorized' END,
        settlement_error = left(p_error, 500), updated_at = now()
    WHERE id = p_request_id AND status = 'capturing' AND capture_attempt = p_attempt
    RETURNING * INTO v_req;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO audit_timeline (transaction_id, step, actor, title, detail, metadata)
    VALUES (v_req.transaction_id, 'error', 'paypal', 'Capture failed — no funds taken', left(p_error, 500),
      jsonb_build_object('request_id', p_request_id, 'terminal', p_terminal));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_agent_void(p_request_id uuid, p_owner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req agent_payment_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM agent_payment_requests WHERE id = p_request_id AND owner_id = p_owner_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'not_found'); END IF;
  IF v_req.status = 'voided' THEN RETURN jsonb_build_object('outcome', 'already_voided'); END IF;
  IF v_req.status = 'voiding' THEN
    RETURN jsonb_build_object('outcome', 'proceed', 'attempt', v_req.void_attempt, 'authorization_id', v_req.paypal_authorization_id);
  END IF;
  IF v_req.status <> 'authorized' OR v_req.paypal_authorization_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'not_allowed', 'reason', format('Payment is %s, so there is no hold to release.', replace(v_req.status, '_', ' ')));
  END IF;
  UPDATE agent_payment_requests
    SET status = 'voiding', void_attempt = void_attempt + 1, settlement_error = NULL, updated_at = now()
    WHERE id = p_request_id RETURNING * INTO v_req;
  UPDATE delivery_links SET revoked = true WHERE request_id = p_request_id AND used_at IS NULL;
  RETURN jsonb_build_object('outcome', 'proceed', 'attempt', v_req.void_attempt, 'authorization_id', v_req.paypal_authorization_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_agent_void(p_request_id uuid, p_attempt integer, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req agent_payment_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM agent_payment_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'conflict'); END IF;
  IF v_req.status = 'voided' THEN RETURN jsonb_build_object('outcome', 'already_voided'); END IF;
  IF v_req.status <> 'voiding' OR v_req.void_attempt <> p_attempt THEN
    RETURN jsonb_build_object('outcome', 'conflict', 'status', v_req.status);
  END IF;
  UPDATE agent_payment_requests SET status = 'voided', voided_at = now(), updated_at = now() WHERE id = p_request_id;
  UPDATE transactions SET status = 'voided', updated_at = now() WHERE id = v_req.transaction_id;
  INSERT INTO escrow_events (transaction_id, event_type, amount_cents, detail)
    VALUES (v_req.transaction_id, 'voided', v_req.amount_cents, coalesce(p_note, 'Owner released the PayPal hold. No funds were taken.'));
  INSERT INTO audit_timeline (transaction_id, step, actor, title, detail, metadata)
    VALUES (v_req.transaction_id, 'paypal_void', 'user', 'Hold released', coalesce(p_note, 'Owner released the PayPal hold. No funds were taken.'),
      jsonb_build_object('request_id', p_request_id, 'authorization_id', v_req.paypal_authorization_id));
  RETURN jsonb_build_object('outcome', 'voided');
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_agent_void(p_request_id uuid, p_attempt integer, p_error text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE agent_payment_requests
    SET status = 'authorized', settlement_error = left(p_error, 500), updated_at = now()
    WHERE id = p_request_id AND status = 'voiding' AND void_attempt = p_attempt;
  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_delivery_link_info(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_delivery_link(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_delivery_link(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_deliverable(uuid, uuid, uuid, text, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_deliverable_review(uuid, text, text, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.begin_agent_capture(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_agent_capture(uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fail_agent_capture(uuid, integer, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.begin_agent_void(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_agent_void(uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fail_agent_void(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_delivery_link_info(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_delivery_link(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_delivery_link(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_deliverable(uuid, uuid, uuid, text, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_deliverable_review(uuid, text, text, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_agent_capture(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_agent_capture(uuid, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_agent_capture(uuid, integer, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_agent_void(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_agent_void(uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_agent_void(uuid, integer, text) TO service_role;

-- Private file storage: owners may read files under their own folder; only the server writes.
CREATE POLICY "owners_read_own_deliverable_files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'deliverables' AND (storage.foldername(name))[1] = auth.uid()::text);
