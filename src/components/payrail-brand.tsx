import { cn } from "@/lib/utils";

/** Vigil logo: a dot-matrix "V" seal whose point lights up mint — the moment escrow releases. */
export function PayrailBrand({ className, compact = false }: { className?: string; compact?: boolean }) {
  return <span className={cn("group inline-flex shrink-0 items-center gap-2.5", className)}>
    <img src="/favicon.svg" alt="" width={32} height={32} className="size-8 transition-transform duration-500 group-hover:scale-110" />
    {!compact && <span className="flex items-baseline gap-2">
      <span className="font-display text-[22px] font-black uppercase leading-none tracking-[-0.04em] [font-stretch:125%]">Vigil</span>
      <span className="hidden border-l pl-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:inline">escrow·ai</span>
    </span>}
  </span>;
}
