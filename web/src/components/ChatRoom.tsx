"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { INTL_LOCALE } from "@/i18n";
import { useLocale, useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/en";
import type { ChatMessage } from "@/lib/chat";

const POLL_MS = 4000;
const TZ = "Asia/Kuala_Lumpur";

function useTime() {
  const locale = useLocale();
  return (iso: string) => {
    const d = new Date(iso);
    const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: TZ });
    const sameDay = day(d) === day(new Date());
    return d.toLocaleString(INTL_LOCALE[locale], { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false, ...(sameDay ? {} : { day: "numeric", month: "short" }) });
  };
}

/** One chat thread: messages, live updates by polling, and a box to send text or a photo. */
export default function ChatRoom({ threadId, meId, initial, info, priceHint, compact }: {
  threadId: number; meId: number; initial: ChatMessage[]; info: string; priceHint?: boolean; compact?: boolean;
}) {
  const t = useT();
  const time = useTime();
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastId = useRef(initial.at(-1)?.id ?? 0);
  const busy = useRef(false);

  useEffect(() => {
    setMessages(initial);
    lastId.current = initial.at(-1)?.id ?? 0;
  }, [threadId, initial]);

  const fetchNew = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const res = await fetch(`/api/chat/${threadId}/messages?after=${lastId.current}`, { cache: "no-store" });
      if (!res.ok) return;
      const { messages: fresh } = (await res.json()) as { messages: ChatMessage[] };
      const add = fresh.filter((m) => m.id > lastId.current);
      if (add.length) {
        lastId.current = add[add.length - 1].id;
        setMessages((old) => [...old, ...add]);
        window.dispatchEvent(new Event("chat:read"));
      }
    } catch {
      // Offline for a moment; the next poll tries again.
    } finally {
      busy.current = false;
    }
  }, [threadId]);

  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") void fetchNew(); };
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    window.dispatchEvent(new Event("chat:read"));
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [fetchNew]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (sending || (!text.trim() && !photo)) return;
    setSending(true);
    setError(null);
    const fd = new FormData();
    fd.set("body", text);
    if (photo) fd.set("photo", photo);
    try {
      const res = await fetch(`/api/chat/${threadId}/messages`, { method: "POST", body: fd });
      if (!res.ok) {
        const { error: key } = (await res.json().catch(() => ({ error: "chat.err.send" }))) as { error: string };
        setError(key.startsWith("chat.") ? t(key as MessageKey) : t("chat.err.send"));
        return;
      }
      setText("");
      setPhoto(null);
      if (fileInput.current) fileInput.current.value = "";
      await fetchNew();
    } catch {
      setError(t("chat.err.send"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={`chatroom ${compact ? "compact" : ""}`}>
      <div className="chat-info">{info}</div>
      <div className="chat-msgs" ref={list} role="log" aria-live="polite" aria-label={t("nav.chat")}>
        {messages.length === 0 && <div className="empty">{t("chat.empty")}</div>}
        {messages.map((m, i) => {
          const mine = m.staffId === meId;
          const showName = !mine && messages[i - 1]?.staffId !== m.staffId;
          return (
            <div key={m.id} className={`msg ${mine ? "mine" : ""}`}>
              {showName && <b className="who">{m.name}</b>}
              <div className="bubble">
                {m.photo && <a href={`/api/chat/photo/${m.id}`} target="_blank" rel="noreferrer"><img src={`/api/chat/photo/${m.id}`} alt={t("chat.photo")} loading="lazy" /></a>}
                {m.body && <p>{m.body}</p>}
                <time dateTime={m.at}>{time(m.at)}</time>
              </div>
            </div>
          );
        })}
      </div>
      <form className="chat-send" onSubmit={send}>
        {photo && <div className="chat-attach"><span>📷 {photo.name}</span><button type="button" className="linkbtn" onClick={() => { setPhoto(null); if (fileInput.current) fileInput.current.value = ""; }}>{t("chat.removePhoto")}</button></div>}
        {error && <div className="chat-err" role="alert">{error}</div>}
        <div className="chat-row">
          <label className="btn small chat-cam" title={t("chat.photo")}>
            <span aria-hidden="true">📷</span><span className="sr">{t("chat.photo")}</span>
            <input ref={fileInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={2000} placeholder={t("chat.placeholder")} aria-label={t("chat.placeholder")}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
          <button type="submit" className="btn small primary" disabled={sending || (!text.trim() && !photo)}>{sending ? t("common.saving") : t("chat.send")}</button>
        </div>
        {priceHint && <div className="chat-hint">{t("chat.priceHint")}</div>}
      </form>
    </div>
  );
}
