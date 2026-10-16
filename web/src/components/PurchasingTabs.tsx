import Link from "next/link";
import type { T } from "@/i18n";

export default function PurchasingTabs({ t, active }: { t: T; active: "po" | "suppliers" | "import" }) {
  const tabs = [["po", "/purchasing", t("po.title")], ["suppliers", "/purchasing/suppliers", t("sup.title")], ["import", "/purchasing/import", t("imp.title")]] as const;
  return <div className="seg" role="group" style={{ alignSelf: "flex-start", maxWidth: "100%", overflowX: "auto" }}>
    {tabs.map(([k, href, label]) => <Link key={k} href={href} aria-pressed={active === k} className="plain" style={{ padding: "6px 12px", fontWeight: 500, background: active === k ? "var(--steel)" : "var(--surface)", color: active === k ? "var(--steel-ink)" : "var(--ink)" }}>{label}</Link>)}
  </div>;
}
