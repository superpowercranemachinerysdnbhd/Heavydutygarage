import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { readStoredFile } from "@/lib/storage";

/** A machine's profile photo, for signed-in staff. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const id = Number((await params).id);
  const [u] = Number.isInteger(id) ? await db.select({ path: schema.machineUnits.photoPath, type: schema.machineUnits.photoType }).from(schema.machineUnits).where(eq(schema.machineUnits.id, id)) : [];
  if (!u?.path || !u.type) return new Response("Not found", { status: 404 });
  const data = await readStoredFile(u.path);
  return new Response(new Uint8Array(data), { headers: { "Content-Type": u.type, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
}
