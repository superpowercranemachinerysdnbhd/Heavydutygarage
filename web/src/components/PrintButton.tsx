"use client";
import { useT } from "@/i18n/client";

export default function PrintButton() {
  const t = useT();
  return <button type="button" className="btn small primary" onClick={() => window.print()}>{t("rep.print")}</button>;
}
