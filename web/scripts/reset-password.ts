/** Set a new password for someone who cannot sign in (e.g. the Head Manager forgot theirs). Run on the server:
 *    docker compose exec app npm run -s user:reset-password
 *  It lists the Head Manager accounts, asks for the phone number and the new password (typed, not kept in the
 *  shell history), signs that person out everywhere and makes sure the account is active.
 *  Non-interactive: npm run -s user:reset-password -- --phone 0123456789 --password "new-password"
 */
import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { loadEnv } from "./env";

loadEnv();
const { values } = parseArgs({ options: { phone: { type: "string" }, password: { type: "string" } } });
const { db, schema, pool } = await import("../src/db/index");
const { eq } = await import("drizzle-orm");
const { hashPassword, passwordProblem } = await import("../src/lib/password");
const { normalisePhone } = await import("../src/lib/phone");

// Questions are read line by line (the readline is opened only when needed, so piped answers are not lost).
let rl: ReturnType<typeof createInterface> | null = null;
const lines: string[] = [];
const ask = async (q: string) => {
  if (!rl) { rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY }); rl.on("line", (l) => lines.push(l)); }
  if (!process.stdin.isTTY) { process.stdout.write(q); for (let i = 0; i < 50 && !lines.length; i++) await new Promise((r) => setTimeout(r, 20)); return lines.shift() ?? ""; }
  return rl.question(q);
};
try {
  const bosses = await db.select({ name: schema.staff.name, phone: schema.staff.phone, active: schema.staff.active }).from(schema.staff).where(eq(schema.staff.role, "boss"));
  console.log("Head Manager accounts:");
  for (const b of bosses) console.log(`  ${b.name}  ·  phone ${b.phone}${b.active ? "" : "  (inactive)"}`);
  const phone = normalisePhone(values.phone ?? (await ask("Phone number of the account to reset: ")));
  const [person] = await db.select().from(schema.staff).where(eq(schema.staff.phone, phone));
  if (!person) { console.error(`No account with phone ${phone}.`); process.exitCode = 1; }
  else {
    const pw = values.password ?? (await ask("New password (at least 8 characters): "));
    if (passwordProblem(pw)) { console.error("Password: use at least 8 characters."); process.exitCode = 1; }
    else {
      await db.update(schema.staff).set({ passwordHash: await hashPassword(pw), active: true }).where(eq(schema.staff.id, person.id));
      await db.delete(schema.sessions).where(eq(schema.sessions.staffId, person.id));
      console.log(`Done. ${person.name} can sign in with phone ${person.phone} and the new password.`);
    }
  }
} finally {
  (rl as ReturnType<typeof createInterface> | null)?.close();
  await pool.end();
}
