import { notFound } from "next/navigation";
import { asc, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Notice } from "@/components/ui";
import StaffFields from "@/components/StaffFields";
import SubmitButton from "@/components/SubmitButton";
import { createStaff } from "../actions";

export const metadata = { title: "Add staff" };

export default async function NewStaffPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "staff.manage")) notFound();
  const sp = await searchParams;
  const managers = await db.select({ id: schema.staff.id, name: schema.staff.name }).from(schema.staff).where(inArray(schema.staff.role, ["boss", "supervisor", "mechanic"])).orderBy(asc(schema.staff.name));
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <h2>Add staff</h2>
      <Notice error={sp.error} />
      <form action={createStaff} className="panel"><div className="form" style={{ padding: 14 }}>
        <StaffFields managers={managers} />
        <label>Temporary password (at least 8 characters)<input name="password" type="text" required minLength={8} autoComplete="off" /></label>
        <div className="full"><SubmitButton className="btn primary">Add staff</SubmitButton></div>
      </div></form>
    </div>
  );
}
