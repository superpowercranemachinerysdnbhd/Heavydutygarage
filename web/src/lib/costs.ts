import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/** What maintenance costs, per work order: parts from stock (at their cost), things bought for the work order, and
 *  labour at each person's pay rate. Dated by the day the work order was opened. Cancelled history is included. */
export type CostRow = { jobId: number; unitId: number; category: string; opened: string; stock: number; bought: number; hours: number; labour: number };

export async function costRows(opts: { unitId?: number; from?: string; to?: string } = {}): Promise<CostRow[]> {
  const where = [
    opts.unitId ? sql`j.unit_id = ${opts.unitId}` : sql`true`,
    opts.from ? sql`j.opened_at >= ${opts.from}` : sql`true`,
    opts.to ? sql`j.opened_at <= ${opts.to}` : sql`true`,
  ];
  const r = await db.execute<{ job_id: number; unit_id: number; category: string; opened: string; stock: string; bought: string; hours: string; labour: string }>(sql`
    select j.id as job_id, j.unit_id, j.category, j.opened_at::text as opened,
      coalesce((select sum(p.qty * p.unit_cost) from job_parts p where p.job_id = j.id), 0) as stock,
      coalesce((select sum(b.qty * b.unit_cost) from job_purchases b where b.job_id = j.id), 0) as bought,
      coalesce((select sum(l.hours) from labour_entries l where l.job_id = j.id), 0) as hours,
      coalesce((select sum(l.hours * s.pay_rate) from labour_entries l join staff s on s.id = l.staff_id where l.job_id = j.id), 0) as labour
    from jobs j where ${sql.join(where, sql` and `)}`);
  return r.rows.map((x) => ({ jobId: Number(x.job_id), unitId: Number(x.unit_id), category: x.category, opened: x.opened,
    stock: Number(x.stock), bought: Number(x.bought), hours: Number(x.hours), labour: Number(x.labour) }));
}

export type CostSum = { n: number; parts: number; labour: number; hours: number };
export function sum(rows: CostRow[]): CostSum {
  return rows.reduce((a, r) => ({ n: a.n + 1, parts: a.parts + r.stock + r.bought, labour: a.labour + r.labour, hours: a.hours + r.hours }), { n: 0, parts: 0, labour: 0, hours: 0 });
}
export function groupBy<K>(rows: CostRow[], key: (r: CostRow) => K): Map<K, CostSum> {
  const m = new Map<K, CostRow[]>();
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return new Map([...m].map(([k, v]) => [k, sum(v)]));
}
