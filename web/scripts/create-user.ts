/** Create a staff login from the command line, e.g. the first Boss account:
 *  npm run user:create -- --name "Tan Boon Hock" --phone 0120000000 --role boss --password "change-me-now"
 */
import { parseArgs } from "node:util";
import { loadEnv } from "./env";

loadEnv();
const { values } = parseArgs({ options: { name: { type: "string" }, phone: { type: "string" }, role: { type: "string", default: "boss" }, password: { type: "string" } } });
const { db, schema, pool } = await import("../src/db/index");
const { hashPassword, passwordProblem } = await import("../src/lib/password");
const { normalisePhone } = await import("../src/lib/phone");
const { isRole } = await import("../src/lib/queries.shared");

if (!values.name || !values.phone || !values.password || !isRole(values.role!)) {
  console.error('Usage: npm run user:create -- --name "Full Name" --phone 0123456789 --role boss --password "at-least-8-chars"');
  process.exit(1);
}
const problem = passwordProblem(values.password);
if (problem) { console.error("Password: use at least 8 characters."); process.exit(1); }
await db.insert(schema.staff).values({ name: values.name, phone: normalisePhone(values.phone), role: values.role, passwordHash: await hashPassword(values.password) });
console.log(`Created ${values.role} ${values.name}. Sign in with phone ${normalisePhone(values.phone)}.`);
await pool.end();
