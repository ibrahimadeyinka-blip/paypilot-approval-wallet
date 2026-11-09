/** Browser-safe NEAR helpers. Amounts are stored in hundredths of a NEAR. */
export const NEAR_RPC_URL = "https://test.rpc.fastnear.com";
export const EXPLORER = "https://testnet.nearblocks.io";

const YOCTO_PER_CENT = 10n ** 22n; // 1 NEAR = 10^24 yocto; 0.01 NEAR = 10^22

export function centsToYocto(cents: number): bigint {
  if (!Number.isInteger(cents) || cents <= 0) throw new Error("Amount must be a positive whole number of 0.01 NEAR.");
  return BigInt(cents) * YOCTO_PER_CENT;
}

export function yoctoToNear(yocto: bigint): string {
  return (Number(yocto / 10n ** 20n) / 10_000).toFixed(2);
}

/** NEAR account rules: 2-64 chars, lowercase a-z 0-9, separators - _ . not leading/trailing/doubled; or 64-hex implicit. */
export function isNearAccountId(id: string): boolean {
  if (id.length < 2 || id.length > 64) return false;
  return /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(id);
}

export const formatNear = (cents: number) => `${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} NEAR`;

export const txUrl = (hash: string) => `${EXPLORER}/txns/${hash}`;
export const accountUrl = (id: string) => `${EXPLORER}/address/${id}`;
