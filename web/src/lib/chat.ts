import "server-only";
import { and, desc, eq, gt, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CurrentUser } from "./auth";
import { can } from "./permissions";
import { canSeeThread, directKey } from "./chat-rules";

const { chatThreads: T, chatMembers: M, chatMessages: Msg, chatReads: R, staff, jobs, jobTeam } = schema;

export async function teamThreadId(): Promise<number> {
  const [t] = await db.select({ id: T.id }).from(T).where(eq(T.kind, "team")).limit(1);
  if (t) return t.id;
  return (await db.insert(T).values({ kind: "team" }).returning({ id: T.id }))[0].id;
}

export async function jobThreadId(jobId: number): Promise<number> {
  const [t] = await db.select({ id: T.id }).from(T).where(eq(T.jobId, jobId));
  if (t) return t.id;
  await db.insert(T).values({ kind: "job", jobId }).onConflictDoNothing();
  return (await db.select({ id: T.id }).from(T).where(eq(T.jobId, jobId)))[0].id;
}

export async function directThreadId(a: number, b: number): Promise<number> {
  const key = directKey(a, b);
  const [t] = await db.select({ id: T.id }).from(T).where(eq(T.directKey, key));
  if (t) return t.id;
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(T).values({ kind: "direct", directKey: key }).onConflictDoNothing().returning({ id: T.id });
    const id = row?.id ?? (await tx.select({ id: T.id }).from(T).where(eq(T.directKey, key)))[0].id;
    await tx.insert(M).values([{ threadId: id, staffId: a }, { threadId: id, staffId: b }]).onConflictDoNothing();
    return id;
  });
}

/** The thread if the user may see it, else null. */
export async function threadFor(user: CurrentUser, threadId: number) {
  const [t] = await db.select().from(T).where(eq(T.id, threadId));
  if (!t) return null;
  if (t.kind === "team") return t;
  if (t.kind === "direct") {
    const members = (await db.select({ id: M.staffId }).from(M).where(eq(M.threadId, t.id))).map((m) => m.id);
    return canSeeThread(user, { kind: "direct", memberIds: members }) ? t : null;
  }
  const [j] = await db.select({ leadId: jobs.leadId }).from(jobs).where(eq(jobs.id, t.jobId!));
  if (!j) return null;
  const teamIds = (await db.select({ id: jobTeam.staffId }).from(jobTeam).where(eq(jobTeam.jobId, t.jobId!))).map((x) => x.id);
  return canSeeThread(user, { kind: "job", job: { leadId: j.leadId, teamIds } }) ? t : null;
}

/** Thread ids the user can see: team, their direct threads, and job threads with messages for jobs they can see. */
async function visibleThreadIds(user: CurrentUser): Promise<number[]> {
  const team = await teamThreadId();
  const direct = (await db.select({ id: M.threadId }).from(M).where(eq(M.staffId, user.id))).map((r) => r.id);
  let jobThreads: number[];
  if (can(user.role, "job.viewAll")) {
    jobThreads = (await db.select({ id: T.id }).from(T).where(and(eq(T.kind, "job"), isNotNull(T.lastMessageAt)))).map((r) => r.id);
  } else {
    const mine = db.select({ id: jobTeam.jobId }).from(jobTeam).where(eq(jobTeam.staffId, user.id));
    jobThreads = (await db.select({ id: T.id }).from(T).innerJoin(jobs, eq(T.jobId, jobs.id))
      .where(and(eq(T.kind, "job"), isNotNull(T.lastMessageAt), or(eq(jobs.leadId, user.id), inArray(jobs.id, mine))))).map((r) => r.id);
  }
  return [team, ...direct, ...jobThreads];
}

async function unreadByThread(userId: number, ids: number[]): Promise<Map<number, number>> {
  if (!ids.length) return new Map();
  const rows = await db.select({ threadId: Msg.threadId, n: sql<number>`count(*)` }).from(Msg)
    .leftJoin(R, and(eq(R.threadId, Msg.threadId), eq(R.staffId, userId)))
    .where(and(inArray(Msg.threadId, ids), ne(Msg.staffId, userId), gt(Msg.id, sql`coalesce(${R.lastReadId}, 0)`)))
    .groupBy(Msg.threadId);
  return new Map(rows.map((r) => [r.threadId, Number(r.n)]));
}

export async function unreadTotal(user: CurrentUser): Promise<number> {
  const m = await unreadByThread(user.id, await visibleThreadIds(user));
  return [...m.values()].reduce((a, b) => a + b, 0);
}

export type ThreadSummary = { id: number; kind: "team" | "direct" | "job"; title: string; subtitle: string | null; jobId: number | null; otherId: number | null;
  last: { body: string; photo: boolean; name: string; at: string } | null; lastAt: string | null; unread: number };

/** `alsoId`: a thread the caller has already access-checked (e.g. an empty job chat being opened). */
export async function listThreads(user: CurrentUser, alsoId?: number): Promise<ThreadSummary[]> {
  const ids = await visibleThreadIds(user);
  if (alsoId && !ids.includes(alsoId)) ids.push(alsoId);
  const [threads, unread, members, lastMsgs] = await Promise.all([
    db.select({ t: T, jobNo: jobs.jobNo, complaint: jobs.complaint }).from(T).leftJoin(jobs, eq(T.jobId, jobs.id)).where(inArray(T.id, ids)),
    unreadByThread(user.id, ids),
    db.select({ threadId: M.threadId, id: staff.id, name: staff.name }).from(M).innerJoin(staff, eq(M.staffId, staff.id)).where(inArray(M.threadId, ids)),
    db.execute<{ thread_id: number; body: string; photo_path: string | null; name: string; created_at: string }>(sql`
      select distinct on (m.thread_id) m.thread_id, m.body, m.photo_path, s.name, m.created_at
      from chat_messages m join staff s on s.id = m.staff_id
      where m.thread_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
      order by m.thread_id, m.id desc`),
  ]);
  const last = new Map(lastMsgs.rows.map((r) => [Number(r.thread_id), r]));
  return threads.map(({ t, jobNo, complaint }) => {
    const other = t.kind === "direct" ? members.find((m) => m.threadId === t.id && m.id !== user.id) : undefined;
    const l = last.get(t.id);
    return {
      id: t.id, kind: t.kind, jobId: t.jobId, otherId: other?.id ?? null,
      title: t.kind === "job" ? jobNo ?? "" : t.kind === "direct" ? other?.name ?? "?" : "",
      subtitle: t.kind === "job" ? (complaint ?? "").slice(0, 60) : null,
      last: l ? { body: l.body, photo: !!l.photo_path, name: l.name, at: new Date(l.created_at).toISOString() } : null,
      lastAt: t.lastMessageAt ? t.lastMessageAt.toISOString() : null,
      unread: unread.get(t.id) ?? 0,
    };
  }).sort((a, b) => (a.kind === "team" ? -1 : b.kind === "team" ? 1 : (b.lastAt ?? "").localeCompare(a.lastAt ?? "")));
}

export type ChatMessage = { id: number; staffId: number; name: string; body: string; photo: boolean; at: string };

/** Messages after `afterId` (or the latest 60), oldest first. Marks them read for the user. */
export async function messagesFor(user: CurrentUser, threadId: number, afterId = 0): Promise<ChatMessage[]> {
  const rows = await db.select({ id: Msg.id, staffId: Msg.staffId, name: staff.name, body: Msg.body, photoPath: Msg.photoPath, at: Msg.createdAt })
    .from(Msg).innerJoin(staff, eq(Msg.staffId, staff.id))
    .where(and(eq(Msg.threadId, threadId), gt(Msg.id, afterId)))
    .orderBy(desc(Msg.id)).limit(afterId ? 200 : 60);
  rows.reverse();
  if (rows.length) await markRead(threadId, user.id, rows[rows.length - 1].id);
  return rows.map((r) => ({ id: r.id, staffId: r.staffId, name: r.name, body: r.body, photo: !!r.photoPath, at: r.at.toISOString() }));
}

export async function markRead(threadId: number, staffId: number, lastId: number) {
  await db.insert(R).values({ threadId, staffId, lastReadId: lastId })
    .onConflictDoUpdate({ target: [R.threadId, R.staffId], set: { lastReadId: sql`greatest(${R.lastReadId}, ${lastId})` } });
}

export async function postMessage(threadId: number, staffId: number, body: string, photo?: { path: string; type: string }) {
  const [m] = await db.insert(Msg).values({ threadId, staffId, body, photoPath: photo?.path ?? null, photoType: photo?.type ?? null }).returning();
  await db.update(T).set({ lastMessageAt: m.createdAt }).where(eq(T.id, threadId));
  await markRead(threadId, staffId, m.id);
  return m;
}
