import { getCurrentUser } from "@/lib/auth";
import { messagesFor, postMessage, threadFor } from "@/lib/chat";
import { cleanBody, MAX_MESSAGE_LENGTH } from "@/lib/chat-rules";
import { ALLOWED_IMAGE_TYPES, MAX_PHOTO_BYTES, saveFile } from "@/lib/storage";

type Ctx = { params: Promise<{ threadId: string }> };
const fail = (error: string, status = 400) => Response.json({ error }, { status });

async function access(ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return { error: fail("auth", 401) };
  const id = Number((await ctx.params).threadId);
  const thread = Number.isInteger(id) ? await threadFor(user, id) : null;
  if (!thread) return { error: fail("notFound", 404) };
  return { user, thread };
}

/** New messages after ?after=ID (or the latest page). Also marks them read. */
export async function GET(req: Request, ctx: Ctx) {
  const a = await access(ctx);
  if ("error" in a) return a.error;
  const after = Number(new URL(req.url).searchParams.get("after") ?? 0) || 0;
  return Response.json({ messages: await messagesFor(a.user, a.thread.id, after) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, ctx: Ctx) {
  const a = await access(ctx);
  if ("error" in a) return a.error;
  const form = await req.formData().catch(() => null);
  if (!form) return fail("chat.err.send");
  const raw = String(form.get("body") ?? "");
  if (raw.trim().length > MAX_MESSAGE_LENGTH) return fail("chat.err.tooLong");
  const body = cleanBody(raw);
  const file = form.get("photo");
  let photo: { path: string; type: string } | undefined;
  if (file instanceof File && file.size > 0) {
    const ext = ALLOWED_IMAGE_TYPES[file.type];
    if (!ext) return fail("chat.err.photoType");
    if (file.size > MAX_PHOTO_BYTES) return fail("chat.err.photoSize");
    photo = { path: await saveFile("chat", Buffer.from(await file.arrayBuffer()), ext), type: file.type };
  }
  if (!body && !photo) return fail("chat.err.empty");
  const m = await postMessage(a.thread.id, a.user.id, body, photo);
  return Response.json({ id: m.id });
}
