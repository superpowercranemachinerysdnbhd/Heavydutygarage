import "server-only";
import QRCode from "qrcode";
import { headers } from "next/headers";

/** The address people reach the app on (from the request, so it works on any domain). */
export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export const faultUrl = (origin: string, token: string) => `${origin}/r/${token}`;

/** QR code as inline SVG markup. */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
}
