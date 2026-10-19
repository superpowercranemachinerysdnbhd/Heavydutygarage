"use client";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";

const b64 = (s: string) => { const p = "=".repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };
type State = "loading" | "unsupported" | "ios-home" | "denied" | "off" | "on" | "busy";

/** Turn phone notifications on or off for this device. iPhone/iPad need the app added to the Home Screen first. */
export default function PushToggle() {
  const t = useT();
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    (async () => {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState(ios && !standalone ? "ios-home" : "unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      setState((await reg.pushManager.getSubscription()) ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);
  async function turnOn() {
    setState("busy"); setMsg("");
    try {
      if ((await Notification.requestPermission()) !== "granted") return setState("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const { key } = await (await fetch("/api/push")).json();
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
      const r = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), device: navigator.userAgent.slice(0, 120), test: true }) });
      if (!r.ok) throw new Error();
      setState("on"); setMsg(t("push.testSent"));
    } catch { setState("off"); setMsg(t("push.failed")); }
  }
  async function turnOff() {
    setState("busy");
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
    setState("off"); setMsg("");
  }
  return (
    <div className="stack" style={{ gap: 8 }}>
      {state === "on" && <p style={{ margin: 0 }}>✓ {t("push.on")}</p>}
      {state === "off" && <p className="muted" style={{ margin: 0 }}>{t("push.offHelp")}</p>}
      {state === "ios-home" && <p className="notice">{t("push.iosHome")}</p>}
      {state === "unsupported" && <p className="muted" style={{ margin: 0 }}>{t("push.unsupported")}</p>}
      {state === "denied" && <p className="notice err">{t("push.denied")}</p>}
      <div className="filters">
        {(state === "off" || state === "busy") && <button type="button" className="btn primary" disabled={state === "busy"} onClick={turnOn}>{t("push.turnOn")}</button>}
        {state === "on" && <><button type="button" className="btn" onClick={turnOn}>{t("push.test")}</button><button type="button" className="btn" onClick={turnOff}>{t("push.turnOff")}</button></>}
      </div>
      {msg && <small className="muted">{msg}</small>}
      <small className="muted">{t("push.what")}</small>
    </div>
  );
}
