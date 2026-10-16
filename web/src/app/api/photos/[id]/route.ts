import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { userCanSeeJob } from "@/lib/job-access";
import { readStoredFile } from "@/lib/storage";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const [photo] = await db.select().from(schema.jobPhotos).where(eq(schema.jobPhotos.id, Number((await params).id)));
  if (!photo || !(await userCanSeeJob(user, photo.jobId))) return new Response("Not found", { status: 404 });
  const data = await readStoredFile(photo.path);
  return new Response(new Uint8Array(data), { headers: { "Content-Type": photo.contentType, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}
