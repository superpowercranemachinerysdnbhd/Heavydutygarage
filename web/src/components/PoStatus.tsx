import type { MessageKey, T } from "@/i18n";

const CLS: Record<string, string> = { awaiting_approval: "appr", ordered: "info", partially_received: "warn", received: "ok", cancelled: "mute" };
export default function PoStatus({ status, t }: { status: string; t: T }) {
  return <span className={`pill ${CLS[status] ?? "mute"}`}>{t(`postatus.${status}` as MessageKey)}</span>;
}
