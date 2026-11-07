import { cn } from "@/lib/utils";

export function PayrailBrand({ className, compact = false }: { className?: string; compact?: boolean }) {
  return <span className={cn("inline-flex shrink-0 items-center gap-2.5", className)}>
    <img src="/favicon.svg" alt="" width={34} height={34} className="size-8" />
    {!compact && <span className="font-display text-[24px] font-semibold leading-none">payrail<span className="text-primary">.</span></span>}
  </span>;
}