"use client";
import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export default function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="stack" style={{ gap: 12 }}>
      {state.error && <div className="notice err" role="alert">{state.error}</div>}
      <label>Phone number<input name="phone" type="tel" autoComplete="username" inputMode="tel" required placeholder="0123456789" /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      <button className="btn primary" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
