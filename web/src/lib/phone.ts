/** Normalise Malaysian phone numbers so "012-345 6789" and "0123456789" match. */
export function normalisePhone(p: string): string {
  return p.replace(/[^0-9+]/g, "");
}
