-- Read-only database regression checks; each result must be true.
WITH cases AS (
  SELECT jsonb_populate_record(NULL::public.agent_tokens, jsonb_build_object(
    'id', '00000000-0000-0000-0000-000000000001', 'revoked', false,
    'expires_at', now() + interval '7 days', 'single_cap_cents', 1000,
    'daily_cap_cents', 6000, 'merchant_whitelist', '[]'::jsonb
  )) AS token,
  jsonb_populate_record(NULL::public.agent_payment_requests, jsonb_build_object(
    'id', '00000000-0000-0000-0000-000000000002',
    'token_id', '00000000-0000-0000-0000-000000000001', 'currency', 'USD',
    'amount_cents', 1000, 'source_context', 'Owner requests a blue logo',
    'merchant_handle', 'alex@studio.io'
  )) AS request
), restricted AS (
  SELECT request, jsonb_populate_record(token, '{"merchant_whitelist":["other@studio.io"]}') AS token FROM cases
)
SELECT 'blank list permits named contractor within $10 cap' AS rule,
  public.agent_request_violation(request, token) IS NULL AS passed FROM cases
UNION ALL
SELECT 'nonempty list blocks unlisted contractor',
  public.agent_request_violation(request, token) LIKE '%approved list%' FROM restricted
UNION ALL
SELECT 'blank list still blocks amount above $10 cap',
  public.agent_request_violation(jsonb_populate_record(request, '{"amount_cents":1001}'), token) LIKE '%single transaction cap%' FROM cases;