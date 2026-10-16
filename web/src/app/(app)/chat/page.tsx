import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listThreads, messagesFor, threadFor, type ThreadSummary } from "@/lib/chat";
import { activeStaff } from "@/lib/queries";
import { getI18n } from "@/i18n/server";
import type { T } from "@/i18n";
import { roleLabel } from "@/i18n/labels";
import { Avatar } from "@/components/ui";
import ChatRoom from "@/components/ChatRoom";
import AutoRefresh from "@/components/AutoRefresh";
import SubmitButton from "@/components/SubmitButton";
import { startDirect } from "./actions";

export async function generateMetadata() {
  return { title: (await getI18n()).t("nav.chat") };
}

function threadTitle(t: T, th: ThreadSummary) {
  return th.kind === "team" ? t("chat.team") : th.title;
}

function ThreadItem({ th, t, active, meName }: { th: ThreadSummary; t: T; active: boolean; meName: string }) {
  const who = th.last ? (th.last.name === meName ? t("chat.you") : th.last.name.split(" ")[0]) : "";
  const preview = th.last ? `${who}: ${th.last.body || t("chat.photoMsg")}` : th.kind === "team" ? t("chat.teamSub") : th.subtitle ?? "";
  return (
    <Link href={`/chat?t=${th.id}`} className={`thread plain ${active ? "on" : ""}`} aria-current={active ? "page" : undefined}>
      {th.kind === "direct" ? <Avatar name={th.title} /> : <span className={`thread-ico ico-${th.kind}`} aria-hidden="true">{th.kind === "team" ? "◆" : "#"}</span>}
      <span className="thread-text"><b>{threadTitle(t, th)}</b><small>{preview}</small></span>
      {th.unread > 0 && <span className="badge" aria-label={t("chat.unread", { n: th.unread })}>{th.unread}</span>}
    </Link>
  );
}

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const user = await requireUser();
  const { t } = await getI18n();
  const sel = Number((await searchParams).t);
  const thread = Number.isInteger(sel) && sel > 0 ? await threadFor(user, sel) : null;
  if (sel && !thread) notFound();
  // Load the open thread first so it counts as read in the list.
  const initial = thread ? await messagesFor(user, thread.id) : [];
  const [threads, staff] = await Promise.all([listThreads(user, thread?.id), activeStaff()]);
  const current = thread ? threads.find((x) => x.id === thread.id) : undefined;
  const others = staff.filter((s) => s.id !== user.id);
  const groups: [string, ThreadSummary[]][] = [
    ["", threads.filter((x) => x.kind === "team")],
    [t("chat.groupDirect"), threads.filter((x) => x.kind === "direct")],
    [t("chat.groupJobs"), threads.filter((x) => x.kind === "job")],
  ];

  const info = !current ? "" : current.kind === "team" ? t("chat.teamInfo") : current.kind === "direct" ? t("chat.private", { name: current.title }) : t("chat.jobInfo");
  const priceHint = current?.kind !== "direct" && (can(user.role, "money.cost") || can(user.role, "money.selling"));

  return (
    <div className="page">
      <AutoRefresh ms={15000} />
      <div className={`chat-layout ${thread ? "has-thread" : ""}`}>
        <aside className="chat-list sect">
          <h3>{t("nav.chat")}</h3>
          <form action={startDirect} className="filters chat-new">
            <select className="field" name="staffId" required aria-label={t("chat.pickPerson")} defaultValue="">
              <option value="" disabled>{t("chat.pickPerson")}</option>
              {others.map((s) => <option key={s.id} value={s.id}>{s.name} · {roleLabel(t, s.role)}</option>)}
            </select>
            <SubmitButton className="btn small">{t("chat.newDm")}</SubmitButton>
          </form>
          {groups.map(([label, list]) => list.length > 0 && (
            <div key={label || "team"}>
              {label && <div className="label chat-group">{label}</div>}
              {list.map((th) => <ThreadItem key={th.id} th={th} t={t} active={th.id === thread?.id} meName={user.name} />)}
            </div>
          ))}
        </aside>
        <section className="chat-main sect">
          {thread && current ? (<>
            <h3>
              <span className="chat-title"><Link href="/chat" className="chat-back">← {t("chat.back")}</Link> {threadTitle(t, current)}{current.subtitle && <span className="muted chat-sub"> · {current.subtitle}</span>}</span>
              {current.kind === "job" && current.jobId && <Link className="btn small" href={`/jobs/${current.jobId}`}>{t("chat.openJob")}</Link>}
            </h3>
            <ChatRoom key={thread.id} threadId={thread.id} meId={user.id} initial={initial} info={info} priceHint={priceHint} />
          </>) : <div className="empty">{t("chat.selectThread")}</div>}
        </section>
      </div>
    </div>
  );
}
