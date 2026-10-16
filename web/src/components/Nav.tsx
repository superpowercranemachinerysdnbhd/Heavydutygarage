"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/i18n/client";

const POLL_MS = 20000;

/** Keeps the chat unread count fresh: polls, and re-checks when a chat is read or the page changes. */
function useUnread(initial: number, path: string) {
  const [n, setN] = useState(initial);
  useEffect(() => setN(initial), [initial]);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/chat/unread", { cache: "no-store" });
        if (res.ok && !stop) setN(((await res.json()) as { count: number }).count);
      } catch { /* try again next time */ }
    };
    const timer = setInterval(load, POLL_MS);
    window.addEventListener("chat:read", load);
    document.addEventListener("visibilitychange", load);
    return () => { stop = true; clearInterval(timer); window.removeEventListener("chat:read", load); document.removeEventListener("visibilitychange", load); };
  }, [path]);
  return n;
}

export default function Nav({ items, chatUnread }: { items: { href: string; label: string }[]; chatUnread: number }) {
  const path = usePathname();
  const t = useT();
  const unread = useUnread(chatUnread, path);
  return (
    <nav className="tabs" aria-label="Sections">
      {items.map((i) => {
        const active = i.href === "/" ? path === "/" : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined}>
            {i.label}
            {i.href === "/chat" && unread > 0 && <span className="badge" aria-label={t("chat.unread", { n: unread })}>{unread > 99 ? "99+" : unread}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
