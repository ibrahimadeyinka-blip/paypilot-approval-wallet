CREATE TABLE public.agent_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES public.profiles(id),
 request_id uuid NOT NULL REFERENCES public.agent_payment_requests(id),
 actor text NOT NULL,
 event text NOT NULL,
 from_status text,
 to_status text NOT NULL,
 detail text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agent_history TO authenticated;
GRANT ALL ON public.agent_history TO service_role;
ALTER TABLE public.agent_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_own_agent_history ON public.agent_history FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE INDEX agent_history_owner_time ON public.agent_history(owner_id, created_at DESC, id DESC);
CREATE INDEX agent_history_request_time ON public.agent_history(request_id, created_at, id);
CREATE FUNCTION public.log_agent_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.authorization_error IS DISTINCT FROM OLD.authorization_error OR NEW.settlement_error IS DISTINCT FROM OLD.settlement_error THEN
 INSERT INTO public.agent_history(owner_id, request_id, actor, event, from_status, to_status, detail, metadata)
 VALUES (NEW.owner_id, NEW.id,
 CASE WHEN TG_OP='INSERT' THEN 'agent' WHEN NEW.status IN ('declined','authorizing') THEN 'owner' WHEN NEW.status IN ('authorized','captured','voided') THEN 'paypal' ELSE 'system' END,
 CASE WHEN TG_OP='INSERT' THEN 'request_received' WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'status_changed' ELSE 'payment_error' END,
 CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.status END, NEW.status,
 coalesce(NEW.block_reason,NEW.authorization_error,NEW.settlement_error),
 jsonb_build_object('amount_cents',NEW.amount_cents,'currency',NEW.currency,'authorization_attempt',NEW.authorization_attempt,'capture_attempt',NEW.capture_attempt,'void_attempt',NEW.void_attempt));
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.log_agent_history() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER record_agent_history AFTER INSERT OR UPDATE ON public.agent_payment_requests FOR EACH ROW EXECUTE FUNCTION public.log_agent_history();
INSERT INTO public.agent_history(owner_id,request_id,actor,event,to_status,detail,metadata,created_at)
 SELECT owner_id,id,'system','imported_snapshot',status,'Existing request snapshot; earlier transitions were not recorded.',jsonb_build_object('amount_cents',amount_cents,'currency',currency),created_at FROM public.agent_payment_requests;
DROP POLICY IF EXISTS insert_own_audit_timeline ON public.audit_timeline;
DROP POLICY IF EXISTS update_own_audit_timeline ON public.audit_timeline;
DROP POLICY IF EXISTS delete_own_audit_timeline ON public.audit_timeline;
DROP POLICY IF EXISTS insert_own_escrow_events ON public.escrow_events;
DROP POLICY IF EXISTS update_own_escrow_events ON public.escrow_events;
DROP POLICY IF EXISTS delete_own_escrow_events ON public.escrow_events;
REVOKE INSERT,UPDATE,DELETE ON public.audit_timeline,public.escrow_events FROM authenticated,anon;
GRANT SELECT ON public.audit_timeline,public.escrow_events TO authenticated;
GRANT ALL ON public.audit_timeline,public.escrow_events TO service_role;
CREATE INDEX IF NOT EXISTS audit_timeline_tx_time ON public.audit_timeline(transaction_id,created_at,id);