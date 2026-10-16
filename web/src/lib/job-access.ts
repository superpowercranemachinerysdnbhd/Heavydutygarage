import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CurrentUser } from "./auth";
import { canWorkOnJob } from "./permissions";

/** Whether the user may see a job's files (photos, signature). */
export async function userCanSeeJob(user: CurrentUser, jobId: number): Promise<boolean> {
  const [job] = await db.select({ leadId: schema.jobs.leadId }).from(schema.jobs).where(eq(schema.jobs.id, jobId));
  if (!job) return false;
  const team = await db.select({ id: schema.jobTeam.staffId }).from(schema.jobTeam).where(eq(schema.jobTeam.jobId, jobId));
  return canWorkOnJob(user, { leadId: job.leadId, teamIds: team.map((t) => t.id) });
}
