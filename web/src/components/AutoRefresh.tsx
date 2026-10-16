"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-render the server page every few seconds while it is on screen (keeps lists like the chat list fresh). */
export default function AutoRefresh({ ms }: { ms: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, ms);
    return () => clearInterval(timer);
  }, [ms, router]);
  return null;
}
