import { cn } from "@/lib/utils";

/** Payrail logo: a "P" whose leg switches onto a lime rail — the agent's request diverted through your guardrails. */
export function PayrailBrand({ className, compact = false }: { className?: string; compact?: boolean }) {
  return <span className={cn("group inline-flex shrink-0 items-center gap-2", className)}>
    <img src="/favicon.svg" alt="" width={30} height={30} className="size-[30px] transition-transform duration-500 group-hover:-rotate-6" />
    {!compact && <span className="font-display text-[21px] font-bold leading-none tracking-[-0.04em]">payrail</span>}
  </span>;
}
