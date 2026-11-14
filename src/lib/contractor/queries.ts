import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ContractorJob {
  id: string;
  vendor_name: string;
  merchant_handle: string;
  description: string;
  delivery_requirements: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  created_at: string;
  approved_at: string | null;
  captured_at: string | null;
  payout_tx: string | null;
  latest: { filename: string; verdict: string; notes: string | null; uploaded_at: string } | null;
}

export const contractorAccountQuery = queryOptions({
  queryKey: ["contractor_account"],
  queryFn: async () => {
    const { data, error } = await supabase.from("contractor_accounts").select("near_account_id, display_name, verified_at").maybeSingle();
    if (error) throw error;
    return data;
  },
});

export const contractorJobsQuery = queryOptions({
  queryKey: ["contractor_jobs"],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("contractor_jobs");
    if (error) throw error;
    return (data ?? []) as unknown as ContractorJob[];
  },
  refetchInterval: 15000,
});

/** Payees on the owner's requests that are verified Vigil contractor accounts. */
export const verifiedPayeesQuery = queryOptions({
  queryKey: ["verified_payees"],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("owner_verified_payees");
    if (error) throw error;
    return new Map((data ?? []).map((r) => [r.near_account_id, r.display_name ?? null]));
  },
});

/** Contractor totals: funds held for them and confirmed on-chain payouts. */
export function contractorTotals(jobs: Pick<ContractorJob, "status" | "amount_cents" | "payout_tx">[]) {
  return jobs.reduce((t, j) => {
    if (["authorized", "capturing", "voiding"].includes(j.status)) t.held += j.amount_cents;
    if (j.status === "captured" && j.payout_tx) { t.paid += j.amount_cents; t.payouts += 1; }
    return t;
  }, { held: 0, paid: 0, payouts: 0 });
}
