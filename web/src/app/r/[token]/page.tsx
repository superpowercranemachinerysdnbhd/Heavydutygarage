import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { settings } from "@/lib/lists";
import { ensureLists } from "@/lib/lists-server";
import { isLocale, translator, type Locale } from "@/i18n";
import { Notice } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import PhotoInput from "@/components/PhotoInput";
import { submitFault } from "./actions";

export const metadata = { title: "Report a problem", robots: { index: false } };
const LANGS: [Locale, string][] = [["ms", "BM"], ["en", "EN"], ["zh", "中文"]];

/** Opened from the QR sticker on a machine: an operator reports a fault without signing in. */
export default async function FaultReportPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string; done?: string; error?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f]{20}$/.test(token)) notFound();
  const [u] = await db.select({ plate: schema.machineUnits.plateNo, serial: schema.machineUnits.serialNo, make: schema.machineModels.make, model: schema.machineModels.model })
    .from(schema.machineUnits).innerJoin(schema.machineModels, eq(schema.machineUnits.modelId, schema.machineModels.id)).where(eq(schema.machineUnits.reportToken, token));
  if (!u) notFound();
  await ensureLists();
  const lang: Locale = isLocale(sp.lang) ? sp.lang : "ms";
  const t = translator(lang);
  const company = settings().companyName || t("app.name");
  return (
    <main className="fr">
      <header className="fr-head">
        <Image src="/logo.jpg" alt="" width={44} height={44} />
        <div><b>{company}</b><small>{t("fr.tagline")}</small></div>
        <nav className="fr-lang">{LANGS.map(([l, n]) => <Link key={l} href={`/r/${token}?lang=${l}`} className={l === lang ? "on" : ""}>{n}</Link>)}</nav>
      </header>
      <section className="fr-machine">
        <small>{t("fr.machine")}</small>
        <h1 className={u.plate ? "mono" : ""}>{u.plate || u.serial}</h1>
        <span>{u.make} {u.model}</span>
      </section>
      {sp.done ? (
        <section className="fr-done">
          <h2>✓ {t("fr.thanks")}</h2>
          <p>{t("fr.thanksText", { no: sp.done })}</p>
          <Link className="btn" href={`/r/${token}?lang=${lang}`}>{t("fr.another")}</Link>
        </section>
      ) : (
        <form action={submitFault} className="fr-form">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="lang" value={lang} />
          <Notice error={sp.error} />
          <label>{t("fr.what")}<textarea name="what" rows={4} required placeholder={t("fr.whatPh")} /></label>
          <fieldset className="fr-yn">
            <legend>{t("fr.canWork")}</legend>
            <label><input type="radio" name="canWork" value="yes" defaultChecked /> {t("fr.yes")}</label>
            <label><input type="radio" name="canWork" value="no" /> {t("fr.no")}</label>
          </fieldset>
          <div><span className="label">{t("fr.photos")}</span><PhotoInput name="photos" multiple ariaLabel={t("fr.photos")} /></div>
          <label>{t("fr.name")}<input name="name" required autoComplete="name" /></label>
          <label>{t("fr.phone")}<input name="phone" type="tel" autoComplete="tel" /></label>
          <SubmitButton className="btn primary fr-send" pendingText={t("fr.sending")}>{t("fr.send")}</SubmitButton>
          <small className="muted">{t("fr.privacy")}</small>
        </form>
      )}
    </main>
  );
}
