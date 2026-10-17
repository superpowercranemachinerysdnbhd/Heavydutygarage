"use client";
import { useRef, useState } from "react";
import { useT } from "@/i18n/client";

const MAX_SIDE = 1920, QUALITY = 0.82;

/** Shrink a phone photo (often 4–8 MB) to a sharp ~0.5 MB JPEG before upload. Falls back to the original. */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 600_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", QUALITY));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

/** File input for photos that shrinks them in the browser, so uploads are quick on mobile data. */
export default function PhotoInput({ name, multiple, label, required, ariaLabel }: { name: string; multiple?: boolean; label?: string; required?: boolean; ariaLabel?: string }) {
  const t = useT();
  const ref = useRef<HTMLInputElement>(null);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  async function onChange() {
    const input = ref.current;
    if (!input?.files?.length) { setCount(0); return; }
    setBusy(true);
    try {
      const out = await Promise.all([...input.files].map(shrink));
      const dt = new DataTransfer();
      out.forEach((f) => dt.items.add(f));
      input.files = dt.files;
      setCount(out.length);
    } catch {
      setCount(input.files.length);
    } finally {
      setBusy(false);
    }
  }
  const input = <input ref={ref} type="file" name={name} accept="image/*" multiple={multiple} required={required} aria-label={ariaLabel} onChange={onChange} />;
  const note = (busy || count > 0) && <small className="muted">{busy ? t("common.saving") : t("f.photosShrunk", { n: count })}</small>;
  return label ? <label>{label}{input}{note}</label> : <span className="photo-input">{input}{note}</span>;
}
