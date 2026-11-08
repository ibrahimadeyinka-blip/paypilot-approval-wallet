DO $migration$
DECLARE
  v_signature text;
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  FOR v_signature, v_old, v_new IN
    SELECT * FROM (VALUES
      ('public.submit_agent_payment(text,text,text,integer,text,text,text,text)',
       'ELSIF NOT (v_merchant = ANY (SELECT lower(m) FROM unnest(v_token.merchant_whitelist) m)) THEN',
       'ELSIF cardinality(v_token.merchant_whitelist) > 0 AND NOT (v_merchant = ANY (SELECT lower(m) FROM unnest(v_token.merchant_whitelist) m)) THEN'),
      ('public.agent_request_violation(public.agent_payment_requests,public.agent_tokens)',
       'ELSIF NOT (lower(p_req.merchant_handle) = ANY (SELECT lower(m) FROM unnest(p_token.merchant_whitelist) m)) THEN',
       'ELSIF cardinality(p_token.merchant_whitelist) > 0 AND NOT (lower(p_req.merchant_handle) = ANY (SELECT lower(m) FROM unnest(p_token.merchant_whitelist) m)) THEN')
    ) AS replacements(signature, old_clause, new_clause)
  LOOP
    SELECT pg_get_functiondef(v_signature::regprocedure) INTO v_definition;
    IF strpos(v_definition, v_old) = 0 THEN
      RAISE EXCEPTION 'Expected allowlist clause not found in %', v_signature;
    END IF;
    -- Replace only membership gating, preserving locks, budgets, status checks and existing privileges.
    EXECUTE replace(v_definition, v_old, v_new);
  END LOOP;
END;
$migration$;