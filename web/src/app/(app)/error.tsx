"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";

/** Shown instead of a blank screen when a page or a save fails (lost connection, server error). The header and menu stay. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  const router = useRouter();
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <div className="notice err stack" style={{ gap: 10 }} role="alert">
        <h2 style={{ margin: 0 }}>{t("err.title")}</h2>
        <p style={{ margin: 0 }}>{t("err.body")}</p>
        {error.digest && <small className="muted">{t("err.code")}: {error.digest}</small>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <button className="btn primary" onClick={() => { router.refresh(); reset(); }}>{t("err.retry")}</button>
        <button className="btn" onClick={() => window.location.reload()}>{t("err.reload")}</button>
        <a className="btn" href="/jobs">{t("err.home")}</a>
      </div>
    </div>
  );
}
