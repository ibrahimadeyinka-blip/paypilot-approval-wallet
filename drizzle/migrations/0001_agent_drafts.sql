CREATE TABLE public.agent_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  token_id uuid,
  ready boolean NOT NULL DEFAULT false,
  amount_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.agent_drafts TO authenticated;
GRANT ALL ON public.agent_drafts TO service_role;
ALTER TABLE public.agent_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own drafts read" ON public.agent_drafts FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "own drafts insert" ON public.agent_drafts FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE INDEX agent_drafts_owner_time ON public.agent_drafts(owner_id, created_at DESC);