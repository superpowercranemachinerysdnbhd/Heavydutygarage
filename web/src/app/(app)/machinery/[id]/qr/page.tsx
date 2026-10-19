import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { settings } from "@/lib/lists";
import { ensureLists } from "@/lib/lists-server";
import { faultUrl, qrSvg, siteOrigin } from "@/lib/qr";
import { getI18n } from "@/i18n/server";
import { Notice } from "@/components/ui";
import PrintButton from "@/components/PrintButton";
import SubmitButton from "@/components/SubmitButton";
import QrSticker from "@/components/QrSticker";
import { newReportToken } from "../../actions";

export async function generateMetadata() {
  return { title: (await getI18n()).t("qr.title") };
}

export default async function MachineQrPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "machine.manage")) notFound();
  const { t } = await getI18n();
  const id = Number((await params).id);
  const sp = await searchParams;
  const [u] = Number.isInteger(id) ? await db.select({ id: schema.machineUnits.id, plate: schema.machineUnits.plateNo, serial: schema.machineUnits.serialNo, token: schema.machineUnits.reportToken, make: schema.machineModels.make, model: schema.machineModels.model })
    .from(schema.machineUnits).innerJoin(schema.machineModels, eq(schema.machineUnits.modelId, schema.machineModels.id)).where(eq(schema.machineUnits.id, id)) : [];
  if (!u) notFound();
  await ensureLists();
  const url = faultUrl(await siteOrigin(), u.token);
  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="crumbs no-print"><Link href="/machinery">{t("nav.machinery")}</Link> / <Link href={`/machinery/${u.id}`}>{u.plate || u.serial}</Link> / {t("qr.title")}</div>
      <div className="view-head no-print"><h2>{t("qr.title")}</h2><PrintButton label={t("qr.print")} /></div>
      <Notice ok={sp.ok} />
      <p className="muted no-print" style={{ margin: 0 }}>{t("qr.help")}</p>
      <div className="qr-sheet"><QrSticker plate={u.plate || u.serial || ""} machine={`${u.make} ${u.model}`} svg={await qrSvg(url)} url={url} company={settings().companyName || t("app.name")} /></div>
      <p className="no-print"><a href={url} target="_blank" rel="noreferrer">{t("qr.open")}</a></p>
      <form action={newReportToken} className="panel no-print" style={{ padding: 14 }}>
        <input type="hidden" name="id" value={u.id} />
        <p className="muted" style={{ marginTop: 0 }}>{t("qr.newHelp")}</p>
        <SubmitButton className="btn small">{t("qr.new")}</SubmitButton>
      </form>
    </div>
  );
}
