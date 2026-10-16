import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { threadFor } from "@/lib/chat";
import { readStoredFile } from "@/lib/storage";

export async function GET(_: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const id = Number((await params).messageId);
  const [m] = Number.isInteger(id) ? await db.select().from(schema.chatMessages).where(eq(schema.chatMessages.id, id)) : [];
  if (!m?.photoPath || !m.photoType || !(await threadFor(user, m.threadId))) return new Response("Not found", { status: 404 });
  const data = await readStoredFile(m.photoPath);
  return new Response(new Uint8Array(data), { headers: { "Content-Type": m.photoType, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}
