import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Used by Docker and uptime monitors: 200 when the app and database are up. */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
