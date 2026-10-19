"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";

type Shot = { src: string; caption: string };

/** Full-screen photo viewer inside the app. Any link with data-viewer="<group>" opens here instead of a new page
 *  (a home-screen app has no back button, so a photo opened as its own page could not be closed).
 *  Close with ✕, the phone's back button/gesture, Esc, a tap outside the photo or a swipe down; swipe or arrows for next / previous. */
export default function PhotoViewer() {
  const t = useT();
  const [shots, setShots] = useState<Shot[]>([]);
  const [i, setI] = useState(0);
  const pushed = useRef(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const open = shots.length > 0;

  const close = useCallback(() => {
    setShots([]);
    if (pushed.current) { pushed.current = false; history.back(); }
  }, []);
  const step = useCallback((d: number) => setI((n) => (n + d + shots.length) % shots.length), [shots.length]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as Element | null)?.closest?.("a[data-viewer]") as HTMLAnchorElement | null;
      if (!a) return;
      e.preventDefault();
      const group = [...document.querySelectorAll<HTMLAnchorElement>(`a[data-viewer="${a.dataset.viewer}"]`)];
      setShots(group.map((x) => ({ src: x.href, caption: x.dataset.caption ?? "" })));
      setI(Math.max(0, group.indexOf(a)));
      history.pushState({ photoViewer: true }, "");
      pushed.current = true;
    };
    const onPop = () => { if (pushed.current) { pushed.current = false; setShots([]); } };
    document.addEventListener("click", onClick);
    window.addEventListener("popstate", onPop);
    return () => { document.removeEventListener("click", onClick); window.removeEventListener("popstate", onPop); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); else if (e.key === "ArrowRight") step(1); else if (e.key === "ArrowLeft") step(-1); };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [open, close, step]);

  if (!open) return null;
  const s = shots[Math.min(i, shots.length - 1)];
  const many = shots.length > 1;
  return (
    <div className="pv" role="dialog" aria-modal="true" aria-label={s.caption || t("job.photos")} onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={(e) => {
        const st = touch.current; touch.current = null;
        if (!st) return;
        const dx = e.changedTouches[0].clientX - st.x, dy = e.changedTouches[0].clientY - st.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) && many) step(dx < 0 ? 1 : -1);
        else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) close();
      }}>
      <button type="button" className="pv-close" onClick={close} aria-label={t("pv.close")}>✕</button>
      {many && <button type="button" className="pv-nav prev" onClick={() => step(-1)} aria-label={t("pv.prev")}>‹</button>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={s.src} alt={s.caption || t("job.photos")} onClick={(e) => e.stopPropagation()} />
      {many && <button type="button" className="pv-nav next" onClick={() => step(1)} aria-label={t("pv.next")}>›</button>}
      <div className="pv-bar">
        <span>{many ? `${i + 1} / ${shots.length}` : ""}{s.caption ? `${many ? " · " : ""}${s.caption}` : ""}</span>
      </div>
    </div>
  );
}
