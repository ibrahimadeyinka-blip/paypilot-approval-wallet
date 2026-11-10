import { useEffect, useRef } from "react";

/** Kinetic escrow vault: particles orbit a locked core; a "release" pulse fires periodically or on demand. */
export function KineticVault({ className, pulseKey = 0, locked = 0 }: { className?: string; pulseKey?: number; locked?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pulse = useRef(0);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  useEffect(() => { if (pulseKey) pulse.current = 1; }, [pulseKey]);

  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const css = getComputedStyle(document.documentElement);
    const green = css.getPropertyValue("--primary").trim() || "#00ff88";
    const cyan = css.getPropertyValue("--highlight").trim() || "#00c8ff";
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const N = 260;
    const ps = Array.from({ length: N }, (_, i) => ({ r: 0.28 + Math.random() * 0.62, a: Math.random() * Math.PI * 2, s: (0.0015 + Math.random() * 0.004) * (i % 2 ? 1 : -1), tilt: Math.random() * Math.PI, z: Math.random() }));
    let raf = 0, t = 0, mx = 0, my = 0;
    const onMove = (e: PointerEvent) => { const b = c.getBoundingClientRect(); mx = (e.clientX - b.left) / b.width - 0.5; my = (e.clientY - b.top) / b.height - 0.5; };
    c.addEventListener("pointermove", onMove);
    const draw = () => {
      const dpr = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
      if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      const cx = w / 2 + mx * 30, cy = h / 2 + my * 30, R = Math.min(w, h) * 0.46;
      t += 1; pulse.current *= 0.965;
      if (!reduce && t % 420 === 0) pulse.current = 1;
      const p = pulse.current;
      // rings
      ctx.lineWidth = 1;
      for (let k = 0; k < 4; k++) {
        ctx.strokeStyle = k % 2 ? cyan : green; ctx.globalAlpha = 0.18 + p * 0.3;
        ctx.setLineDash([2, 8 + k * 4]); ctx.lineDashOffset = -t * (k % 2 ? 0.4 : -0.3);
        ctx.beginPath(); ctx.ellipse(cx, cy, R * (0.35 + k * 0.18) * (1 + p * 0.15), R * (0.12 + k * 0.07), (t * 0.002) + k, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.setLineDash([]);
      // particles
      for (const q of ps) {
        q.a += reduce ? 0 : q.s * (1 + p * 4);
        const rr = R * q.r * (1 + p * 0.5);
        const x = cx + Math.cos(q.a) * rr, y = cy + Math.sin(q.a) * rr * Math.cos(q.tilt) * 0.55;
        ctx.globalAlpha = 0.35 + q.z * 0.6; ctx.fillStyle = q.z > 0.6 ? cyan : green;
        ctx.fillRect(x, y, 1.6 + q.z * 1.4, 1.6 + q.z * 1.4);
      }
      // core (hexagonal vault)
      const cr = R * 0.2;
      ctx.globalAlpha = 1; ctx.strokeStyle = green; ctx.lineWidth = 1.5; ctx.shadowColor = green; ctx.shadowBlur = 18 + p * 30;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + t * 0.004; const X = cx + Math.cos(a) * cr, Y = cy + Math.sin(a) * cr; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
      ctx.closePath(); ctx.stroke();
      ctx.shadowBlur = 0; ctx.fillStyle = green; ctx.font = "600 12px 'JetBrains Mono', monospace"; ctx.textAlign = "center";
      ctx.fillText(`${(lockedRef.current / 100).toFixed(2)} Ⓝ`, cx, cy + 4);
      if (p > 0.05) { ctx.globalAlpha = p; ctx.strokeStyle = cyan; ctx.beginPath(); ctx.arc(cx, cy, cr + (1 - p) * R, 0, Math.PI * 2); ctx.stroke(); }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); c.removeEventListener("pointermove", onMove); };
  }, []);
  return <canvas ref={ref} className={className} aria-label="Animated escrow vault" role="img" />;
}
