import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { notifyStaff, vapidKeys } from "@/lib/notify";

/** GET: the public key the browser needs to subscribe. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  return Response.json({ key: (await vapidKeys()).publicKey });
}

/** POST {subscription, device?, test?}: save this device's subscription (and optionally send a test). */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const body = await req.json().catch(() => null) as { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; device?: string; test?: boolean } | null;
  const s = body?.subscription;
  if (!s?.endpoint || !/^https:\/\//.test(s.endpoint) || !s.keys?.p256dh || !s.keys?.auth) return new Response("Bad subscription", { status: 400 });
  const P = schema.pushSubscriptions;
  const values = { staffId: user.id, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, device: (body?.device ?? "").slice(0, 120) || null };
  await db.insert(P).values(values).onConflictDoUpdate({ target: P.endpoint, set: values });
  if (body?.test) await notifyStaff([user.id], { key: "nt.test", url: "/account", urgent: true });
  return Response.json({ ok: true });
}

/** DELETE {endpoint}: this device no longer wants notifications. */
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const body = await req.json().catch(() => null) as { endpoint?: string } | null;
  if (body?.endpoint) await db.delete(schema.pushSubscriptions).where(and(eq(schema.pushSubscriptions.endpoint, body.endpoint), eq(schema.pushSubscriptions.staffId, user.id)));
  return Response.json({ ok: true });
}
