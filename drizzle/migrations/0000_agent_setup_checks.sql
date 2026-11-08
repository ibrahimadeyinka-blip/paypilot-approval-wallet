CREATE TABLE public.agent_ai_state (owner_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE, pause_reason text, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.agent_ai_state TO authenticated;
GRANT ALL ON public.agent_ai_state TO service_role;
ALTER TABLE public.agent_ai_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read AI status" ON public.agent_ai_state FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE OR REPLACE FUNCTION public.payrail_setup_checks() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.agent_tokens; r public.agent_payment_requests; missing text[]; blank_ok boolean; restricted_ok boolean; cap_ok boolean;
BEGIN
 SELECT array_agg(name) INTO missing FROM unnest(ARRAY['profiles','agent_tokens','agent_payment_requests','agent_history','delivery_links','deliverables','agent_drafts','agent_ai_state']) name WHERE to_regclass('public.'||name) IS NULL;
 t := jsonb_populate_record(NULL::public.agent_tokens, jsonb_build_object('id','00000000-0000-0000-0000-000000000001','revoked',false,'expires_at',now()+interval '7 days','single_cap_cents',1000,'daily_cap_cents',6000,'merchant_whitelist','[]'::jsonb));
 r := jsonb_populate_record(NULL::public.agent_payment_requests, jsonb_build_object('id','00000000-0000-0000-0000-000000000002','token_id',t.id,'currency','USD','amount_cents',1000,'source_context','Owner requests a blue logo','merchant_handle','alex@studio.io'));
 blank_ok := public.agent_request_violation(r,t) IS NULL;
 restricted_ok := public.agent_request_violation(r,jsonb_populate_record(t,'{"merchant_whitelist":["other@studio.io"]}')) LIKE '%approved list%';
 cap_ok := public.agent_request_violation(jsonb_populate_record(r,'{"amount_cents":1001}'),t) LIKE '%single transaction cap%';
 RETURN jsonb_build_object('schema_ready', missing IS NULL,'missing_tables',coalesce(to_jsonb(missing),'[]'::jsonb),'blank_payees_allowed',blank_ok,'restricted_payees_blocked',restricted_ok,'cap_enforced',cap_ok,'submission_blank_guard',position('cardinality(v_token.merchant_whitelist) > 0' IN pg_get_functiondef('public.submit_agent_payment(text,text,text,integer,text,text,text,text)'::regprocedure)) > 0);
END; $$;
REVOKE ALL ON FUNCTION public.payrail_setup_checks() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.payrail_setup_checks() TO service_role;
DO $$ DECLARE c jsonb; BEGIN c:=public.payrail_setup_checks(); IF NOT (c->>'blank_payees_allowed')::boolean OR NOT (c->>'restricted_payees_blocked')::boolean OR NOT (c->>'cap_enforced')::boolean OR NOT (c->>'submission_blank_guard')::boolean THEN RAISE EXCEPTION 'Optional payee regression failed'; END IF; END $$;