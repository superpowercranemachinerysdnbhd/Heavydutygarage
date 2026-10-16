import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { ROLE_LABEL } from "@/lib/permissions";
import { Notice } from "@/components/ui";

export const metadata = { title: "Account" };

async function changePassword(form: FormData) {
  "use server";
  const user = await requireUser();
  const current = String(form.get("current") ?? ""), next = String(form.get("next") ?? ""), again = String(form.get("again") ?? "");
  const [row] = await db.select({ hash: schema.staff.passwordHash }).from(schema.staff).where(eq(schema.staff.id, user.id));
  if (!(await verifyPassword(current, row?.hash ?? null))) redirect("/account?error=" + encodeURIComponent("Current password is wrong."));
  const problem = passwordProblem(next);
  if (problem) redirect("/account?error=" + encodeURIComponent(problem));
  if (next !== again) redirect("/account?error=" + encodeURIComponent("The new passwords do not match."));
  await db.update(schema.staff).set({ passwordHash: await hashPassword(next) }).where(eq(schema.staff.id, user.id));
  redirect("/account?ok=" + encodeURIComponent("Password changed."));
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  return (
    <div className="page" style={{ maxWidth: 520 }}>
      <h2>Your account</h2>
      <Notice error={sp.error} ok={sp.ok} />
      <div className="panel"><div className="facts">
        <div><span className="label">Name</span><b>{user.name}</b></div>
        <div><span className="label">Role</span><b>{ROLE_LABEL[user.role]}</b></div>
        <div><span className="label">Phone (sign-in)</span><b className="mono">{user.phone}</b></div>
      </div></div>
      <form action={changePassword} className="panel">
        <div className="panel-head"><h3>Change password</h3></div>
        <div className="in form" style={{ padding: 14 }}>
          <label>Current password<input type="password" name="current" autoComplete="current-password" required /></label>
          <label>New password (at least 8 characters)<input type="password" name="next" autoComplete="new-password" required minLength={8} /></label>
          <label>New password again<input type="password" name="again" autoComplete="new-password" required minLength={8} /></label>
          <div><button className="btn primary">Change password</button></div>
        </div>
      </form>
    </div>
  );
}
