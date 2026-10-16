import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { userCanSeeJob } from "@/lib/job-access";
import { readStoredFile } from "@/lib/storage";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const jobId = Number((await params).id);
  const [job] = await db.select({ path: schema.jobs.signaturePath }).from(schema.jobs).where(eq(schema.jobs.id, jobId));
  if (!job?.path || !(await userCanSeeJob(user, jobId))) return new Response("Not found", { status: 404 });
  const data = await readStoredFile(job.path);
  return new Response(new Uint8Array(data), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}
