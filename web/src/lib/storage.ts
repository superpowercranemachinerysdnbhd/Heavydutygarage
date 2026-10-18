import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

/** Local file storage for photos and signatures. Swap for S3-compatible storage in production. */
const ROOT = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? "./storage");

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif",
};
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export async function saveFile(folder: "photos" | "signatures" | "chat" | "imports", data: Buffer, ext: string): Promise<string> {
  const dir = path.join(/*turbopackIgnore: true*/ ROOT, folder);
  await mkdir(/*turbopackIgnore: true*/ dir, { recursive: true });
  const rel = `${folder}/${randomUUID()}.${ext}`;
  await writeFile(path.join(/*turbopackIgnore: true*/ ROOT, rel), data);
  return rel;
}

export async function readStoredFile(rel: string): Promise<Buffer> {
  const full = path.resolve(/*turbopackIgnore: true*/ ROOT, rel);
  if (!full.startsWith(ROOT + path.sep)) throw new Error("Invalid path");
  return readFile(/*turbopackIgnore: true*/ full);
}
