"use client";
import { useT } from "@/i18n/client";

export default function PrintButton({ label }: { label?: string }) {
  const t = useT();
  return <button type="button" className="btn small primary" onClick={() => window.print()}>{label ?? t("rep.print")}</button>;
}
