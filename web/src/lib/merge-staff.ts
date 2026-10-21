import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/** Merge `fromId` into `toId` (the same person entered twice): every record that points at the duplicate is moved to
 *  the person kept, then the duplicate is removed and its name kept as an alias. Every table with a foreign key to
 *  staff is found from the database catalogue, so tables added later are covered too. Where a unique rule would be
 *  broken (e.g. both on the same job team, or both have attendance that day), the kept person's row wins. */
export async function mergeStaff(fromId: number, toId: number) {
  await db.transaction(async (tx) => {
    const [from] = await tx.select().from(schema.staff).where(eq(schema.staff.id, fromId));
    const [to] = await tx.select().from(schema.staff).where(eq(schema.staff.id, toId));
    if (!from || !to || fromId === toId) throw new Error("bad-merge");
    // Pay history belongs to the person kept; the duplicate's is dropped unless the kept person has none.
    const kept = await tx.select({ id: schema.staffPayRates.id }).from(schema.staffPayRates).where(eq(schema.staffPayRates.staffId, toId));
    if (kept.length) await tx.delete(schema.staffPayRates).where(eq(schema.staffPayRates.staffId, fromId));
    const fks = (await tx.execute<{ tbl: string; col: string; notnull: boolean }>(sql`
      select c.conrelid::regclass::text as tbl, a.attname as col, a.attnotnull as notnull
      from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
      where c.contype = 'f' and c.confrelid = 'staff'::regclass`)).rows;
    const ident = (s: string) => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`unexpected name ${s}`); return `"${s}"`; };
    for (const { tbl, col } of fks) {
      const t = ident(tbl.replace(/^"|"$/g, "")), c = ident(col);
      // Unique indexes that include this column: drop the duplicate's rows that would collide with the kept person's.
      const uniques = (await tx.execute<{ cols: string[] }>(sql`
        select array(select a.attname::text from pg_attribute a where a.attrelid = i.indrelid and a.attnum = any(i.indkey)) as cols
        from pg_index i where i.indrelid = ${tbl}::regclass and i.indisunique and not i.indisprimary`)).rows
        .map((r) => r.cols).filter((cols) => cols.includes(col));
      for (const cols of uniques) {
        const others = cols.filter((x) => x !== col).map(ident);
        const same = others.map((o) => `x.${o} is not distinct from s.${o}`).join(" and ") || "true";
        await tx.execute(sql.raw(`delete from ${t} s where s.${c} = ${fromId} and exists (select 1 from ${t} x where x.${c} = ${toId} and ${same})`));
      }
      await tx.execute(sql.raw(`update ${t} set ${c} = ${toId} where ${c} = ${fromId}`));
    }
    // reports_to has no foreign key; a lead who is also on the team is listed once.
    await tx.update(schema.staff).set({ reportsTo: toId }).where(eq(schema.staff.reportsTo, fromId));
    await tx.execute(sql`delete from job_team jt using jobs j where jt.job_id = j.id and jt.staff_id = j.lead_id`);
    const aliases = [...new Set([...to.aliases, from.name, ...from.aliases])].filter((n) => n.toLowerCase() !== to.name.toLowerCase());
    await tx.update(schema.staff).set({ aliases, payRate: Number(to.payRate) > 0 ? to.payRate : from.payRate, skills: [...new Set([...to.skills, ...from.skills])] }).where(eq(schema.staff.id, toId));
    await tx.delete(schema.staff).where(eq(schema.staff.id, fromId));
  });
}
