"use client";
import { useActionState } from "react";
import { useT } from "@/i18n/client";
import { login, type LoginState } from "./actions";

export default function LoginForm() {
  const t = useT();
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="stack" style={{ gap: 12 }}>
      {state.error && <div className="notice err" role="alert">{state.error}</div>}
      <label>{t("login.phone")}<input key={state.phone ?? ""} name="phone" type="tel" autoComplete="username" inputMode="tel" required placeholder="0123456789" defaultValue={state.phone ?? ""} /></label>
      <label>{t("login.password")}<input name="password" type="password" autoComplete="current-password" required /></label>
      <button className="btn primary" disabled={pending}>{pending ? t("login.pending") : t("login.submit")}</button>
    </form>
  );
}
