CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
REVOKE INSERT,UPDATE,DELETE ON public.agent_history FROM authenticated,anon;
GRANT SELECT ON public.agent_history TO authenticated;
GRANT ALL ON public.agent_history TO service_role;
CREATE FUNCTION public.protect_audit_events() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF coalesce(auth.role(),'') IN ('authenticated','anon') THEN RAISE EXCEPTION 'Audit events cannot be changed or deleted'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_audit_events() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER protect_agent_history BEFORE UPDATE OR DELETE ON public.agent_history FOR EACH ROW EXECUTE FUNCTION public.protect_audit_events();
CREATE TRIGGER protect_audit_timeline BEFORE UPDATE OR DELETE ON public.audit_timeline FOR EACH ROW EXECUTE FUNCTION public.protect_audit_events();
CREATE TRIGGER protect_escrow_events BEFORE UPDATE OR DELETE ON public.escrow_events FOR EACH ROW EXECUTE FUNCTION public.protect_audit_events();