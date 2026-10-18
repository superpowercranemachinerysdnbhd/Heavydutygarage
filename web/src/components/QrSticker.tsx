import { translator } from "@/i18n";

/** One printable sticker: plate, machine, QR code and the instruction in three languages. */
export default function QrSticker({ plate, machine, svg, url, company }: { plate: string; machine: string; svg: string; url: string; company: string }) {
  const [ms, en, zh] = (["ms", "en", "zh"] as const).map((l) => translator(l)("qr.scan"));
  return (
    <div className="qr-sticker">
      <div className="qr-top"><b>{company}</b></div>
      <div className="qr-code" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="qr-plate mono">{plate}</div>
      <div className="qr-machine">{machine}</div>
      <div className="qr-scan"><b>{ms}</b><span>{en}</span><span>{zh}</span></div>
      <div className="qr-url">{url.replace(/^https?:\/\//, "")}</div>
    </div>
  );
}
