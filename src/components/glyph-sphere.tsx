import { useEffect, useRef } from "react";

/** A rotating sphere of characters spelling the escrow lifecycle. Pointer tilts it. Pure canvas, no deps. */
export function GlyphSphere({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const word = "LOCKVERIFYRELEASENEARESCROW";
    const N = 520;
    const pts = Array.from({ length: N }, (_, i) => {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const t = i * 2.399963;
      return { x: Math.cos(t) * r, y, z: Math.sin(t) * r, c: word[i % word.length] };
    });
    const styles = getComputedStyle(canvas);
    const fg = styles.getPropertyValue("--foreground").trim() || "#333";
    const hi = styles.getPropertyValue("--highlight").trim() || "#16e";
    const sg = styles.getPropertyValue("--signal").trim() || "#0d8";
    let rotY = 0, tiltX = -0.25, targetX = -0.25, speed = 0.004, raf = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const resize = () => {
      const d = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * d; canvas.height = canvas.clientHeight * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    resize();
    const onMove = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect();
      targetX = ((e.clientY - b.top) / b.height - 0.5) * 0.9;
      speed = 0.004 + ((e.clientX - b.left) / b.width - 0.5) * 0.02;
    };
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("resize", resize);
    const draw = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight, R = Math.min(w, h) * 0.38;
      ctx.clearRect(0, 0, w, h);
      tiltX += (targetX - tiltX) * 0.05; rotY += speed;
      const cy = Math.cos(rotY), sy = Math.sin(rotY), cx = Math.cos(tiltX), sx = Math.sin(tiltX);
      const proj = pts.map((p) => {
        const x1 = p.x * cy - p.z * sy, z1 = p.x * sy + p.z * cy;
        const y2 = p.y * cx - z1 * sx, z2 = p.y * sx + z1 * cx;
        return { x: w / 2 + x1 * R, y: h / 2 + y2 * R, z: z2, c: p.c };
      }).sort((a, b) => a.z - b.z);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (const p of proj) {
        const depth = (p.z + 1) / 2;
        ctx.globalAlpha = 0.12 + depth * 0.8;
        ctx.font = `${500} ${8 + depth * 7}px "IBM Plex Mono", monospace`;
        ctx.fillStyle = p.c === "N" && depth > 0.8 ? sg : depth > 0.93 ? hi : fg;
        ctx.fillText(p.c, p.x, p.y);
      }
      ctx.globalAlpha = 1;
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); canvas.removeEventListener("pointermove", onMove); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className={className} aria-hidden />;
}
