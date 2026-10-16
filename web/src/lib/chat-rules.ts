/** Who may read and write a chat thread. Pure, so it can be tested. */
import { canWorkOnJob, type Role } from "./permissions";

export type ThreadInfo =
  | { kind: "team" }
  | { kind: "direct"; memberIds: number[] }
  | { kind: "job"; job: { leadId: number | null; teamIds: number[] } };

export function canSeeThread(user: { id: number; role: Role }, t: ThreadInfo): boolean {
  if (t.kind === "team") return true;
  if (t.kind === "direct") return t.memberIds.includes(user.id);
  return canWorkOnJob(user, t.job);
}

export function directKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export const MAX_MESSAGE_LENGTH = 2000;
export function cleanBody(s: string): string {
  return s.replace(/\r\n/g, "\n").trim().slice(0, MAX_MESSAGE_LENGTH);
}
