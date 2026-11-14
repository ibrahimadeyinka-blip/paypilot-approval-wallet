CREATE TABLE public.contractor_accounts (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  near_account_id text NOT NULL UNIQUE CHECK (length(near_account_id) <= 64 AND near_account_id ~ '^[a-z0-9_-]+(\.[a-z0-9_-]+)*\.testnet$'),
  public_key text NOT NULL,
  display_name text CHECK (display_name IS NULL OR length(display_name) <= 80),
  verified_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.contractor_accounts TO authenticated;
GRANT ALL ON public.contractor_accounts TO service_role;
ALTER TABLE public.contractor_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_own_contractor_account ON public.contractor_accounts FOR SELECT TO authenticated USING (auth.uid() = user_id);
COMMENT ON TABLE public.contractor_accounts IS 'Verified NEAR testnet payout accounts. Written only by the server after a wallet signature proves key ownership.';

-- Server-only: called after the NEP-413 signature and full-access key are verified.
CREATE OR REPLACE FUNCTION public.link_contractor_account(p_user_id uuid, p_account text, p_public_key text, p_display_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Proving the key wins: a NEAR account can be linked to only one Vigil user.
  DELETE FROM contractor_accounts WHERE near_account_id = lower(p_account) AND user_id <> p_user_id;
  INSERT INTO contractor_accounts (user_id, near_account_id, public_key, display_name, verified_at)
    VALUES (p_user_id, lower(p_account), p_public_key, NULLIF(left(btrim(coalesce(p_display_name, '')), 80), ''), now())
  ON CONFLICT (user_id) DO UPDATE SET near_account_id = excluded.near_account_id, public_key = excluded.public_key,
    display_name = excluded.display_name, verified_at = now();
  RETURN jsonb_build_object('near_account_id', lower(p_account));
END $$;
REVOKE ALL ON FUNCTION public.link_contractor_account(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_contractor_account(uuid, text, text, text) TO service_role;

-- Contractor view of funded jobs addressed to their verified account. No owner identity is returned.
CREATE OR REPLACE FUNCTION public.contractor_jobs()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(j ORDER BY j->>'created_at' DESC), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'id', r.id, 'vendor_name', r.vendor_name, 'merchant_handle', r.merchant_handle, 'description', r.description,
      'delivery_requirements', r.delivery_requirements, 'amount_cents', r.amount_cents, 'currency', r.currency,
      'status', r.status, 'created_at', r.created_at, 'approved_at', r.approved_at, 'captured_at', r.captured_at,
      'payout_tx', CASE WHEN r.status = 'captured' THEN r.paypal_capture_id END,
      'latest', (SELECT jsonb_build_object('filename', d.filename, 'verdict', d.ai_verdict, 'notes', d.ai_notes, 'uploaded_at', d.uploaded_at)
                 FROM deliverables d WHERE d.request_id = r.id ORDER BY d.uploaded_at DESC LIMIT 1)
    ) AS j
    FROM agent_payment_requests r
    JOIN contractor_accounts c ON c.near_account_id = r.merchant_handle AND c.user_id = auth.uid()
    WHERE r.status IN ('authorized', 'capturing', 'captured', 'capture_failed', 'voiding', 'voided')
    ORDER BY r.created_at DESC LIMIT 200
  ) s;
$$;
REVOKE ALL ON FUNCTION public.contractor_jobs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contractor_jobs() TO authenticated, service_role;

-- Server-only: the verified contractor claims a delivery slot for a held job (replaces the one-time link).
CREATE OR REPLACE FUNCTION public.claim_contractor_delivery(p_user_id uuid, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req agent_payment_requests%ROWTYPE;
  v_acct text;
BEGIN
  SELECT near_account_id INTO v_acct FROM contractor_accounts WHERE user_id = p_user_id;
  IF v_acct IS NULL THEN RETURN jsonb_build_object('outcome', 'no_account'); END IF;
  SELECT * INTO v_req FROM agent_payment_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.merchant_handle <> v_acct THEN RETURN jsonb_build_object('outcome', 'not_found'); END IF;
  IF v_req.status <> 'authorized' THEN RETURN jsonb_build_object('outcome', 'closed'); END IF;
  IF EXISTS (SELECT 1 FROM deliverables WHERE request_id = p_request_id AND ai_verdict = 'pending' AND uploaded_at > now() - interval '10 minutes') THEN
    RETURN jsonb_build_object('outcome', 'busy');
  END IF;
  IF (SELECT count(*) FROM deliverables WHERE request_id = p_request_id) >= 5 THEN
    RETURN jsonb_build_object('outcome', 'limit');
  END IF;
  RETURN jsonb_build_object('outcome', 'claimed', 'link_id', NULL, 'request_id', v_req.id,
    'owner_id', v_req.owner_id, 'vendor_name', v_req.vendor_name, 'description', v_req.description,
    'requirements', v_req.delivery_requirements, 'amount_cents', v_req.amount_cents, 'currency', v_req.currency);
END $$;
REVOKE ALL ON FUNCTION public.claim_contractor_delivery(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_contractor_delivery(uuid, uuid) TO service_role;

-- Same signature; labels uploads from verified contractor accounts (no link) distinctly in the audit trail.
CREATE OR REPLACE FUNCTION public.record_deliverable(p_link_id uuid, p_request_id uuid, p_deliverable_id uuid, p_storage_path text, p_filename text, p_mime text, p_size integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req agent_payment_requests%ROWTYPE;
  v_by text := CASE WHEN p_link_id IS NULL THEN 'contractor (verified account)' ELSE 'merchant (upload link)' END;
  v_actor text := CASE WHEN p_link_id IS NULL THEN 'contractor' ELSE 'merchant' END;
BEGIN
  SELECT * INTO v_req FROM agent_payment_requests WHERE id = p_request_id;
  IF NOT FOUND OR v_req.transaction_id IS NULL THEN
    RAISE EXCEPTION 'Request has no held payment';
  END IF;
  INSERT INTO deliverables (id, transaction_id, request_id, link_id, filename, storage_path, mime_type, size_bytes, uploaded_by, ai_verdict)
    VALUES (p_deliverable_id, v_req.transaction_id, p_request_id, p_link_id, p_filename, p_storage_path, p_mime, p_size, v_by, 'pending');
  INSERT INTO audit_timeline (transaction_id, step, actor, title, detail, metadata)
    VALUES (v_req.transaction_id, 'deliverable_uploaded', v_actor, 'Deliverable uploaded', p_filename,
      jsonb_build_object('request_id', p_request_id, 'deliverable_id', p_deliverable_id, 'link_id', p_link_id,
        'uploaded_by', v_by, 'mime_type', p_mime, 'size_bytes', p_size));
  RETURN p_deliverable_id;
END $$;
REVOKE ALL ON FUNCTION public.record_deliverable(uuid, uuid, uuid, text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_deliverable(uuid, uuid, uuid, text, text, text, integer) TO service_role;

-- Owner view: which of their payees are verified Vigil contractor accounts.
CREATE OR REPLACE FUNCTION public.owner_verified_payees()
RETURNS TABLE (near_account_id text, display_name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT c.near_account_id, c.display_name
  FROM contractor_accounts c
  JOIN agent_payment_requests r ON r.merchant_handle = c.near_account_id
  WHERE r.owner_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.owner_verified_payees() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_verified_payees() TO authenticated, service_role;