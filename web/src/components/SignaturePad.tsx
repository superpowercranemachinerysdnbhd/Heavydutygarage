"use client";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";

/** Finger/mouse signature box. Writes a PNG data URL into a hidden input named `signature`. */
export default function SignaturePad() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState("");
  const t = useT();

  function reset() {
    const c = canvas.current; if (!c) return;
    const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, r.width * dpr); c.height = Math.max(1, r.height * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, r.width, r.height);
    ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#111";
    setData("");
  }

  useEffect(() => {
    reset();
    const c = canvas.current!; const ctx = c.getContext("2d")!;
    let drawing = false;
    const pt = (e: PointerEvent) => { const b = c.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top] as const; };
    const down = (e: PointerEvent) => { drawing = true; c.setPointerCapture(e.pointerId); const [x, y] = pt(e); ctx.beginPath(); ctx.moveTo(x, y); };
    const move = (e: PointerEvent) => { if (!drawing) return; const [x, y] = pt(e); ctx.lineTo(x, y); ctx.stroke(); };
    const up = () => { if (!drawing) return; drawing = false; setData(c.toDataURL("image/png")); };
    c.addEventListener("pointerdown", down); c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up);
    return () => { c.removeEventListener("pointerdown", down); c.removeEventListener("pointermove", move); c.removeEventListener("pointerup", up); c.removeEventListener("pointercancel", up); };
  }, []);

  return (
    <div className="stack" style={{ gap: 6 }}>
      <canvas ref={canvas} className="sigpad" aria-label={t("sig.pad")} />
      <input type="hidden" name="signature" value={data} />
      <div><button type="button" className="btn small" onClick={reset}>{t("sig.clear")}</button></div>
    </div>
  );
}
