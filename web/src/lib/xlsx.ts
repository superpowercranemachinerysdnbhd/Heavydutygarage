/** Minimal .xlsx reader: cell values of every sheet, as text, by sheet name. Enough for importing exported
 *  spreadsheets (AppSheet / Google Sheets / Excel) without a third-party library. Server-side only (uses zlib). */
import { inflateRawSync } from "node:zlib";

export type Sheets = Record<string, string[][]>;

function unzip(buf: Buffer): Map<string, Buffer> {
  // End of central directory: signature 0x06054b50, searched from the end (a comment may follow it).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad zip directory");
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const dataAt = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataAt, dataAt + size);
    if (method === 0 || method === 8) files.set(name, method === 8 ? inflateRawSync(raw) : raw);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const unescape = (s: string) => s.replace(/&(lt|gt|quot|apos|amp|#(\d+)|#x([0-9a-f]+));/gi, (_, e, d, h) =>
  d ? String.fromCodePoint(Number(d)) : h ? String.fromCodePoint(parseInt(h, 16)) : ({ lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" } as Record<string, string>)[e.toLowerCase()]);
/** Text of an <si> or <is> element: all <t> runs joined (phonetic <rPh> runs left out). */
const runs = (x: string) => [...x.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unescape(m[1])).join("");
const colIndex = (ref: string) => { let n = 0; for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

export function readXlsx(buf: Buffer): Sheets {
  const files = unzip(buf);
  const text = (n: string) => files.get(n)?.toString("utf8") ?? "";
  const shared = [...text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => runs(m[1]));
  const rels = new Map([...text("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b([^>]*)\/?>/g)].map((m) => {
    const a = m[1]; return [/Id="([^"]+)"/.exec(a)?.[1] ?? "", (/Target="([^"]+)"/.exec(a)?.[1] ?? "").replace(/^\/?(xl\/)?/, "xl/")];
  }));
  const out: Sheets = {};
  for (const m of text("xl/workbook.xml").matchAll(/<sheet\b([^>]*)\/>/g)) {
    const name = unescape(/name="([^"]*)"/.exec(m[1])?.[1] ?? "");
    const rid = /r:id="([^"]+)"/.exec(m[1])?.[1] ?? "";
    const xml = text(rels.get(rid) ?? "");
    const rows: string[][] = [];
    for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const row: string[] = [];
      for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1], body = c[2] ?? "";
        const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
        const type = /t="([^"]+)"/.exec(attrs)?.[1];
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        const val = type === "s" ? shared[Number(v)] ?? "" : type === "inlineStr" ? runs(body) : v !== undefined ? unescape(v) : "";
        row[ref ? colIndex(ref) : row.length] = val;
      }
      rows.push(Array.from(row, (x) => x ?? ""));
    }
    out[name] = rows;
  }
  return out;
}

/** Excel serial date (days since 1899-12-30) → yyyy-mm-dd; text dates (dd/mm/yy, yyyy-mm-dd) are accepted too. */
export function excelDate(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n < 20000 || n > 80000) return null;
    return new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  return null;
}

/** Sheet rows as objects keyed by the (trimmed) header row; empty rows are dropped. */
export function records(rows: string[][] | undefined): Record<string, string>[] {
  if (!rows?.length) return [];
  const head = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.some((c) => c.trim())).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}
