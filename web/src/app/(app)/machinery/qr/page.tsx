import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { settings } from "@/lib/lists";
import { ensureLists } from "@/lib/lists-server";
import { faultUrl, qrSvg, siteOrigin } from "@/lib/qr";
import { getI18n } from "@/i18n/server";
import PrintButton from "@/components/PrintButton";
import QrSticker from "@/components/QrSticker";

export async function generateMetadata() {
  return { title: (await getI18n()).t("qr.all") };
}

/** Every machine's sticker on one printable sheet. */
export default async function AllQrPage() {
  const user = await requireUser();
  if (!can(user.role, "machine.manage")) notFound();
  const { t } = await getI18n();
  await ensureLists();
  const origin = await siteOrigin();
  const rows = await db.select({ id: schema.machineUnits.id, plate: schema.machineUnits.plateNo, serial: schema.machineUnits.serialNo, token: schema.machineUnits.reportToken, make: schema.machineModels.make, model: schema.machineModels.model })
    .from(schema.machineUnits).innerJoin(schema.machineModels, eq(schema.machineUnits.modelId, schema.machineModels.id))
    .orderBy(asc(sql`coalesce(${schema.machineUnits.plateNo}, ${schema.machineUnits.serialNo})`));
  const company = settings().companyName || t("app.name");
  const stickers = await Promise.all(rows.map(async (u) => ({ ...u, url: faultUrl(origin, u.token), svg: await qrSvg(faultUrl(origin, u.token)) })));
  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="crumbs no-print"><Link href="/machinery">{t("nav.machinery")}</Link> / {t("qr.all")}</div>
      <div className="view-head no-print"><h2>{t("qr.all")} <span className="muted" style={{ fontSize: "1rem" }}>{rows.length}</span></h2><PrintButton label={t("qr.print")} /></div>
      <p className="muted no-print" style={{ margin: 0 }}>{t("qr.help")}</p>
      <div className="qr-sheet">{stickers.map((u) => <QrSticker key={u.id} plate={u.plate || u.serial || ""} machine={`${u.make} ${u.model}`} svg={u.svg} url={u.url} company={company} />)}</div>
    </div>
  );
}
