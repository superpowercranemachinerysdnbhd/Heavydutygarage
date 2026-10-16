"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LOCALES } from "@/i18n";
import { useLocale, useT } from "@/i18n/client";
import { setLanguage } from "@/app/lang-action";

export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  const locale = useLocale(), t = useT(), router = useRouter();
  const [pending, start] = useTransition();
  return (
    <select className={`lang ${className}`} value={locale} disabled={pending} aria-label={t("common.language")}
      onChange={(e) => { const v = e.target.value; start(async () => { await setLanguage(v); router.refresh(); }); }}>
      {LOCALES.map((l) => <option key={l} value={l}>{t(`lang.${l}`)}</option>)}
    </select>
  );
}
