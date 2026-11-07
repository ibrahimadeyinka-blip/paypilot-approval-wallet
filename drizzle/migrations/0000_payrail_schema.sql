-- Payrail schema (consolidated from the Bolt project's four migrations)

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  paypal_handle text,
  paypal_connected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own_profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "insert_own_profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "update_own_profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "delete_own_profile" ON public.profiles FOR DELETE TO authenticated USING (auth.uid() = id);

-- Auto-create a profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- transactions
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  vendor_name text NOT NULL DEFAULT '',
  vendor_handle text,
  description text NOT NULL DEFAULT '',
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'draft',
  ai_request text NOT NULL DEFAULT '',
  ai_reasoning text,
  source_text text,
  source_filename text,
  proof_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX idx_transactions_status ON public.transactions(status);
CREATE POLICY "select_own_transactions" ON public.transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_transactions" ON public.transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_transactions" ON public.transactions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own_transactions" ON public.transactions FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- escrow_events
CREATE TABLE public.escrow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  amount_cents integer,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.escrow_events TO authenticated;
GRANT ALL ON public.escrow_events TO service_role;
ALTER TABLE public.escrow_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_escrow_events_transaction_id ON public.escrow_events(transaction_id);
CREATE POLICY "select_own_escrow_events" ON public.escrow_events FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = escrow_events.transaction_id AND t.user_id = auth.uid()));
CREATE POLICY "insert_own_escrow_events" ON public.escrow_events FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = escrow_events.transaction_id AND t.user_id = auth.uid()));
CREATE POLICY "update_own_escrow_events" ON public.escrow_events FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = escrow_events.transaction_id AND t.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = escrow_events.transaction_id AND t.user_id = auth.uid()));
CREATE POLICY "delete_own_escrow_events" ON public.escrow_events FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = escrow_events.transaction_id AND t.user_id = auth.uid()));

-- deliverables
CREATE TABLE public.deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  filename text NOT NULL DEFAULT '',
  storage_path text NOT NULL DEFAULT '',
  mime_type text,
  size_bytes integer,
  ai_verdict text NOT NULL DEFAULT 'pending',
  ai_notes text,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deliverables TO authenticated;
GRANT ALL ON public.deliverables TO service_role;
ALTER TABLE public.deliverables ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_deliverables_transaction_id ON public.deliverables(transaction_id);
CREATE POLICY "select_own_deliverables" ON public.deliverables FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = deliverables.transaction_id AND t.user_id = auth.uid()));
CREATE POLICY "insert_own_deliverables" ON public.deliverables FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = deliverables.transaction_id AND t.user_id = auth.uid()));
CREATE POLICY "update_own_deliverables" ON public.deliverables FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = deliverables.transaction_id AND t.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = deliverables.transaction_id AND t.user_id = auth.uid()));
CREATE POLICY "delete_own_deliverables" ON public.deliverables FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = deliverables.transaction_id AND t.user_id = auth.uid()));

-- audit_timeline
CREATE TABLE public.audit_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  step text NOT NULL,
  actor text NOT NULL DEFAULT 'system',
  title text NOT NULL DEFAULT '',
  detail text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_timeline TO authenticated;
GRANT ALL ON public.audit_timeline TO service_role;
ALTER TABLE public.audit_timeline ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_audit_timeline_transaction_id ON public.audit_timeline(transaction_id);
CREATE INDEX idx_audit_timeline_created ON public.audit_timeline(created_at);
CREATE POLICY "select_own_audit_timeline" ON public.audit_timeline FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = audit_timeline.transaction_id AND t.user_id = auth.uid()));
CREATE POLICY "insert_own_audit_timeline" ON public.audit_timeline FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = audit_timeline.transaction_id AND t.user_id = auth.uid()));
CREATE POLICY "update_own_audit_timeline" ON public.audit_timeline FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = audit_timeline.transaction_id AND t.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = audit_timeline.transaction_id AND t.user_id = auth.uid()));
CREATE POLICY "delete_own_audit_timeline" ON public.audit_timeline FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = audit_timeline.transaction_id AND t.user_id = auth.uid()));

-- products
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  image_url text,
  category text,
  stock integer DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_products_seller_id ON public.products(seller_id);
CREATE INDEX idx_products_status ON public.products(status);
CREATE INDEX idx_products_category ON public.products(category);
CREATE POLICY "select_all_products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_own_products" ON public.products FOR INSERT TO authenticated WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "update_own_products" ON public.products FOR UPDATE TO authenticated USING (auth.uid() = seller_id) WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "delete_own_products" ON public.products FOR DELETE TO authenticated USING (auth.uid() = seller_id);
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- conversations
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_conversations_buyer_id ON public.conversations(buyer_id);
CREATE INDEX idx_conversations_seller_id ON public.conversations(seller_id);
CREATE INDEX idx_conversations_product_id ON public.conversations(product_id);
CREATE INDEX idx_conversations_transaction_id ON public.conversations(transaction_id);
CREATE POLICY "select_own_conversations" ON public.conversations FOR SELECT TO authenticated USING (auth.uid() = buyer_id OR auth.uid() = seller_id);
CREATE POLICY "insert_own_conversations" ON public.conversations FOR INSERT TO authenticated WITH CHECK (auth.uid() = buyer_id);
CREATE POLICY "update_own_conversations" ON public.conversations FOR UPDATE TO authenticated USING (auth.uid() = buyer_id OR auth.uid() = seller_id) WITH CHECK (auth.uid() = buyer_id OR auth.uid() = seller_id);
CREATE POLICY "delete_own_conversations" ON public.conversations FOR DELETE TO authenticated USING (auth.uid() = buyer_id OR auth.uid() = seller_id);
CREATE TRIGGER trg_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- messages
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user',
  content text NOT NULL DEFAULT '',
  draft_transaction jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at);
CREATE POLICY "select_own_messages" ON public.messages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())));
CREATE POLICY "insert_own_messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())));
CREATE POLICY "update_own_messages" ON public.messages FOR UPDATE TO authenticated USING (auth.uid() = sender_id) WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "delete_own_messages" ON public.messages FOR DELETE TO authenticated USING (auth.uid() = sender_id);

-- Sellers can read trades, escrow events and audit entries for their conversations
CREATE POLICY "select_seller_transactions" ON public.transactions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.transaction_id = transactions.id AND c.seller_id = auth.uid()));
CREATE POLICY "select_seller_escrow_events" ON public.escrow_events FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.transaction_id = escrow_events.transaction_id AND c.seller_id = auth.uid()));
CREATE POLICY "select_seller_audit_timeline" ON public.audit_timeline FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.transaction_id = audit_timeline.transaction_id AND c.seller_id = auth.uid()));

-- agent_tokens
CREATE TABLE public.agent_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  label text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  expires_at timestamptz NOT NULL,
  merchant_whitelist text[] NOT NULL DEFAULT '{}',
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.agent_tokens TO authenticated;
GRANT ALL ON public.agent_tokens TO service_role;
ALTER TABLE public.agent_tokens ENABLE ROW LEVEL SECURITY;
CREATE INDEX agent_tokens_owner_idx ON public.agent_tokens (owner_id);
CREATE POLICY "select_own_agent_tokens" ON public.agent_tokens FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "insert_own_agent_tokens" ON public.agent_tokens FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "update_own_agent_tokens" ON public.agent_tokens FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- agent_payment_requests (written only by the agent gateway)
CREATE TABLE public.agent_payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES public.agent_tokens(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vendor_name text NOT NULL DEFAULT '',
  merchant_handle text NOT NULL DEFAULT '',
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'USD',
  description text NOT NULL DEFAULT '',
  source_context text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('pending_approval', 'approved', 'declined', 'blocked')),
  block_reason text,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
GRANT SELECT ON public.agent_payment_requests TO authenticated;
GRANT ALL ON public.agent_payment_requests TO service_role;
ALTER TABLE public.agent_payment_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX agent_payment_requests_owner_idx ON public.agent_payment_requests (owner_id, created_at DESC);
CREATE INDEX agent_payment_requests_token_idx ON public.agent_payment_requests (token_id, created_at DESC);
CREATE POLICY "select_own_agent_requests" ON public.agent_payment_requests FOR SELECT TO authenticated USING (auth.uid() = owner_id);

-- respond_to_order: buyer approves/declines a seller order from chat
CREATE OR REPLACE FUNCTION public.respond_to_order(p_message_id uuid, p_accept boolean)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg messages%ROWTYPE;
  v_conv conversations%ROWTYPE;
  v_draft jsonb;
  v_amount integer;
  v_txn_id uuid;
BEGIN
  SELECT * INTO v_msg FROM messages WHERE id = p_message_id;
  IF NOT FOUND OR v_msg.draft_transaction IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  SELECT * INTO v_conv FROM conversations WHERE id = v_msg.conversation_id;
  IF NOT FOUND OR v_conv.buyer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the buyer can respond to this order';
  END IF;

  v_draft := v_msg.draft_transaction;
  IF COALESCE(v_draft->>'order_status', 'pending') <> 'pending' THEN
    RAISE EXCEPTION 'This order has already been answered';
  END IF;

  IF NOT p_accept THEN
    UPDATE messages
      SET draft_transaction = v_draft || jsonb_build_object('order_status', 'declined')
      WHERE id = p_message_id;
    RETURN NULL;
  END IF;

  v_amount := (v_draft->>'amount_cents')::integer;
  IF v_amount IS NULL OR v_amount <= 0 OR v_amount > 100000000 THEN
    RAISE EXCEPTION 'Invalid order amount';
  END IF;

  INSERT INTO transactions (
    user_id, vendor_name, description, amount_cents, currency, status,
    ai_request, ai_reasoning, source_text, proof_verified
  ) VALUES (
    v_conv.buyer_id,
    COALESCE(v_draft->>'vendor_name', ''),
    COALESCE(v_draft->>'description', ''),
    v_amount,
    COALESCE(v_draft->>'currency', 'USD'),
    'authorized',
    '',
    v_draft->>'ai_reasoning',
    v_draft->>'source_text',
    COALESCE((v_draft->>'proof_verified')::boolean, false)
  )
  RETURNING id INTO v_txn_id;

  INSERT INTO escrow_events (transaction_id, event_type, amount_cents, detail)
  VALUES (v_txn_id, 'authorized', v_amount, 'Buyer approved the order. Funds held in escrow.');

  INSERT INTO audit_timeline (transaction_id, step, actor, title, detail, metadata)
  VALUES (
    v_txn_id, 'user_request', 'user', 'Order approved by buyer',
    'The buyer approved the order created by the seller in chat.',
    jsonb_build_object('amount_cents', v_amount)
  );

  INSERT INTO audit_timeline (transaction_id, step, actor, title, detail, metadata)
  VALUES (
    v_txn_id, 'paypal_authorize', 'paypal', 'Funds authorized & held',
    'Funds are held in escrow until the seller delivers and the buyer confirms.',
    jsonb_build_object('amount_cents', v_amount, 'paypal_action', 'authorize')
  );

  UPDATE messages
    SET draft_transaction = v_draft || jsonb_build_object('order_status', 'approved', 'transaction_id', v_txn_id)
    WHERE id = p_message_id;

  UPDATE conversations
    SET transaction_id = v_txn_id, status = 'escrow_held'
    WHERE id = v_conv.id;

  RETURN v_txn_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.respond_to_order(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_order(uuid, boolean) TO authenticated;

-- decide_agent_payment: owner approves/declines an agent payment request
CREATE OR REPLACE FUNCTION public.decide_agent_payment(p_request_id uuid, p_approve boolean)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req agent_payment_requests%ROWTYPE;
  v_token agent_tokens%ROWTYPE;
  v_txn_id uuid;
BEGIN
  SELECT * INTO v_req FROM agent_payment_requests WHERE id = p_request_id;
  IF NOT FOUND OR v_req.owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Payment request not found';
  END IF;

  IF v_req.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'This request has already been decided';
  END IF;

  IF NOT p_approve THEN
    UPDATE agent_payment_requests
      SET status = 'declined', decided_at = now()
      WHERE id = p_request_id;
    RETURN NULL;
  END IF;

  SELECT * INTO v_token FROM agent_tokens WHERE id = v_req.token_id;
  IF v_token.revoked OR v_token.expires_at <= now() THEN
    UPDATE agent_payment_requests
      SET status = 'blocked',
          block_reason = 'Agent token expired or was revoked before approval. Payment halted.',
          decided_at = now()
      WHERE id = p_request_id;
    RETURN NULL;
  END IF;

  INSERT INTO transactions (
    user_id, vendor_name, description, amount_cents, currency, status,
    ai_request, ai_reasoning, source_text, proof_verified
  ) VALUES (
    v_req.owner_id,
    v_req.vendor_name,
    v_req.description,
    v_req.amount_cents,
    v_req.currency,
    'authorized',
    v_req.description,
    'Agent payment request approved by the owner.',
    v_req.source_context,
    false
  )
  RETURNING id INTO v_txn_id;

  INSERT INTO escrow_events (transaction_id, event_type, amount_cents, detail)
  VALUES (v_txn_id, 'authorized', v_req.amount_cents, 'Owner approved the agent request. Funds held in escrow.');

  INSERT INTO audit_timeline (transaction_id, step, actor, title, detail, metadata)
  VALUES (
    v_txn_id, 'ai_extraction', 'ai', 'Source text cross-referenced',
    v_req.source_context,
    jsonb_build_object('token_id', v_req.token_id, 'request_id', v_req.id)
  );

  INSERT INTO audit_timeline (transaction_id, step, actor, title, detail, metadata)
  VALUES (
    v_txn_id, 'paypal_authorize', 'paypal', 'PayPal authorization initiated',
    'Funds are held in escrow until delivery is verified and the owner confirms.',
    jsonb_build_object('amount_cents', v_req.amount_cents, 'paypal_action', 'authorize')
  );

  UPDATE agent_payment_requests
    SET status = 'approved', transaction_id = v_txn_id, decided_at = now()
    WHERE id = p_request_id;

  RETURN v_txn_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.decide_agent_payment(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_agent_payment(uuid, boolean) TO authenticated;

-- advance_transaction: buyer/seller move a held trade forward
CREATE OR REPLACE FUNCTION public.advance_transaction(p_transaction_id uuid, p_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_txn transactions%ROWTYPE;
  v_conv conversations%ROWTYPE;
  v_has_conv boolean;
  v_is_buyer boolean;
  v_is_seller boolean;
BEGIN
  SELECT * INTO v_txn FROM transactions WHERE id = p_transaction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trade not found';
  END IF;

  SELECT * INTO v_conv FROM conversations WHERE transaction_id = p_transaction_id LIMIT 1;
  v_has_conv := FOUND;

  v_is_buyer := v_txn.user_id = auth.uid();
  v_is_seller := v_has_conv AND v_conv.seller_id = auth.uid();

  IF NOT v_is_buyer AND NOT v_is_seller THEN
    RAISE EXCEPTION 'You are not a party to this trade';
  END IF;

  IF p_action = 'mark_delivered' THEN
    IF NOT v_is_seller OR v_txn.status <> 'authorized' THEN
      RAISE EXCEPTION 'The seller can only mark a held trade as delivered';
    END IF;
    UPDATE transactions SET status = 'under_review' WHERE id = p_transaction_id;
    INSERT INTO escrow_events (transaction_id, event_type, amount_cents, detail)
    VALUES (p_transaction_id, 'delivered', v_txn.amount_cents, 'Seller marked the work as delivered. Waiting for buyer confirmation.');
    INSERT INTO audit_timeline (transaction_id, step, actor, title, detail, metadata)
    VALUES (
      p_transaction_id, 'deliverable_upload', 'vendor', 'Marked as delivered',
      'The seller says the work has been delivered. The buyer can now confirm.',
      jsonb_build_object('amount_cents', v_txn.amount_cents)
    );

  ELSIF p_action = 'confirm_delivery' THEN
    IF NOT v_is_buyer OR v_txn.status NOT IN ('under_review', 'authorized')
       OR (v_txn.status = 'authorized' AND v_has_conv) THEN
      RAISE EXCEPTION 'The buyer can only confirm a trade that has been marked as delivered';
    END IF;
    UPDATE transactions SET status = 'captured' WHERE id = p_transaction_id;
    INSERT INTO escrow_events (transaction_id, event_type, amount_cents, detail)
    VALUES (p_transaction_id, 'captured', v_txn.amount_cents, 'Buyer confirmed delivery. Funds released to seller.');
    INSERT INTO audit_timeline (transaction_id, step, actor, title, detail, metadata)
    VALUES (
      p_transaction_id, 'fund_capture', 'paypal', 'Final PayPal capture closed',
      'Buyer confirmed delivery. Funds were released to the seller.',
      jsonb_build_object('amount_cents', v_txn.amount_cents, 'paypal_action', 'capture')
    );

  ELSIF p_action = 'void' THEN
    IF NOT v_is_buyer OR v_txn.status NOT IN ('authorized', 'under_review') THEN
      RAISE EXCEPTION 'This trade can no longer be voided';
    END IF;
    UPDATE transactions SET status = 'voided' WHERE id = p_transaction_id;
    INSERT INTO escrow_events (transaction_id, event_type, amount_cents, detail)
    VALUES (p_transaction_id, 'voided', v_txn.amount_cents, 'Buyer voided the trade. Held funds returned to buyer.');
    INSERT INTO audit_timeline (transaction_id, step, actor, title, detail, metadata)
    VALUES (
      p_transaction_id, 'fund_void', 'user', 'Authorization voided',
      'Held funds released back to the buyer. Escrow closed.',
      jsonb_build_object('amount_cents', v_txn.amount_cents, 'paypal_action', 'void')
    );

  ELSE
    RAISE EXCEPTION 'Unknown action';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.advance_transaction(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_transaction(uuid, text) TO authenticated;
