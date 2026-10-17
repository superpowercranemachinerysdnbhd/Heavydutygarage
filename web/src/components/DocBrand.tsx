import Image from "next/image";
import type { T } from "@/i18n";
import { settings } from "@/lib/lists";

/** Logo, company name and contact lines at the top of printed reports and POs. */
export default function DocBrand({ t }: { t: T }) {
  const s = settings();
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Image src="/logo.jpg" alt="" width={64} height={64} />
      <div>
        <div className="doc-brand">{s.companyName || t("app.name")}</div>
        <small>{t("rep.tagline")}</small>
        {s.companyReg && <small style={{ display: "block" }}>{t("set.companyReg").split(" / ")[0]}: {s.companyReg}</small>}
        {(s.companyAddress || s.companyPhone) && <small style={{ display: "block", whiteSpace: "pre-line" }}>{[s.companyAddress, s.companyPhone].filter(Boolean).join("\n")}</small>}
      </div>
    </div>
  );
}
