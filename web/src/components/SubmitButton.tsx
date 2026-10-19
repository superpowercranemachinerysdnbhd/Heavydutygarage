"use client";
import { useFormStatus } from "react-dom";
import { useT } from "@/i18n/client";

/** confirm: ask "Are you sure?" first (for removals). */
export default function SubmitButton({ children, className = "btn small", pendingText, confirm }: { children: React.ReactNode; className?: string; pendingText?: string; confirm?: string }) {
  const { pending } = useFormStatus();
  const t = useT();
  return <button className={className} disabled={pending} onClick={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined}>{pending ? pendingText ?? t("common.saving") : children}</button>;
}
