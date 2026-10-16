import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { getI18n } from "@/i18n/server";
import { translator } from "@/i18n";
import { roleLabel } from "@/i18n/labels";
import { Notice } from "@/components/ui";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export async function generateMetadata() {
  return { title: (await getI18n()).t("account.title") };
}

async function changePassword(form: FormData) {
  "use server";
  const user = await requireUser();
  const t = translator(user.locale);
  const back = (k: "error" | "ok", msg: string): never => redirect(`/account?${k}=` + encodeURIComponent(msg));
  const current = String(form.get("current") ?? ""), next = String(form.get("next") ?? ""), again = String(form.get("again") ?? "");
  const [row] = await db.select({ hash: schema.staff.passwordHash }).from(schema.staff).where(eq(schema.staff.id, user.id));
  if (!(await verifyPassword(current, row?.hash ?? null))) back("error", t("account.wrongCurrent"));
  const problem = passwordProblem(next);
  if (problem) back("error", t(problem));
  if (next !== again) back("error", t("account.mismatch"));
  await db.update(schema.staff).set({ passwordHash: await hashPassword(next) }).where(eq(schema.staff.id, user.id));
  back("ok", t("account.changed"));
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const user = await requireUser();
  const { t } = await getI18n();
  const sp = await searchParams;
  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <h2>{t("account.title")}</h2>
      <Notice error={sp.error} ok={sp.ok} />
      <div className="panel"><div className="facts">
        <div><span className="label">{t("account.name")}</span><b>{user.name}</b></div>
        <div><span className="label">{t("account.role")}</span><b>{roleLabel(t, user.role)}</b></div>
        <div><span className="label">{t("account.phone")}</span><b className="mono">{user.phone}</b></div>
        <div style={{ gridColumn: "1/-1" }}><span className="label">{t("common.language")}</span><div><LanguageSwitcher className="on-light" /></div><small className="muted">{t("account.languageHelp")}</small></div>
      </div></div>
      <form action={changePassword} className="panel">
        <div className="panel-head"><h3>{t("account.changePw")}</h3></div>
        <div className="in form" style={{ padding: 14 }}>
          <label>{t("account.current")}<input type="password" name="current" autoComplete="current-password" required /></label>
          <label>{t("account.new")}<input type="password" name="next" autoComplete="new-password" required minLength={8} /></label>
          <label>{t("account.again")}<input type="password" name="again" autoComplete="new-password" required minLength={8} /></label>
          <div><button className="btn primary">{t("account.changePw")}</button></div>
        </div>
      </form>
    </div>
  );
}
