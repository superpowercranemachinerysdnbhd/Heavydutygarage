"use client";
import { useFormStatus } from "react-dom";
import { useT } from "@/i18n/client";

export default function SubmitButton({ children, className = "btn small", pendingText }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  const t = useT();
  return <button className={className} disabled={pending}>{pending ? pendingText ?? t("common.saving") : children}</button>;
}
