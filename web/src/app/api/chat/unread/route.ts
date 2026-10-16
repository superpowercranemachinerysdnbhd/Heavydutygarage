import { getCurrentUser } from "@/lib/auth";
import { unreadTotal } from "@/lib/chat";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "auth" }, { status: 401 });
  return Response.json({ count: await unreadTotal(user) }, { headers: { "Cache-Control": "no-store" } });
}
