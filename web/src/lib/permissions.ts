/** Roles and what each one may do. Every permission check in the app goes through `can`. */
export type Role = "boss" | "supervisor" | "mechanic" | "assistant" | "fabricator" | "painter" | "cleaner";

export const ROLE_LABEL: Record<Role, string> = {
  boss: "Boss",
  supervisor: "Supervisor",
  mechanic: "Mechanic",
  assistant: "Assistant Mechanic",
  fabricator: "Fabricator",
  painter: "Painter",
  cleaner: "Cleaner",
};

/** Roles that can lead a job. */
export const LEAD_ROLES: Role[] = ["mechanic", "fabricator", "painter"];
/** Roles that work on the floor (crew). */
export const CREW_ROLES: Role[] = ["mechanic", "assistant", "fabricator", "painter", "cleaner"];

export type Action =
  | "job.viewAll"        // see every job, not only jobs they are on
  | "job.create"
  | "job.assign"         // set lead and team
  | "job.editDetails"    // category, priority, due date, location, complaint
  | "job.qc"             // tick the QC checklist
  | "job.handover"       // record customer sign-off and close
  | "job.anyStatus"      // move a job to any status (otherwise limited to crew statuses)
  | "job.report"         // generate the customer service report
  | "money.selling"      // job value, labour charge, selling prices
  | "money.cost"         // part purchase prices (phase 2)
  | "money.labourCost"   // pay rates, labour cost, margins
  | "customer.manage"
  | "machine.manage"
  | "stock.manage"       // parts, suppliers, issue and adjust stock
  | "po.create"          // raise purchase orders and receive goods
  | "po.approve"         // approve purchase orders above the limit
  | "price.set"          // set selling prices and markup rules
  | "staff.view"         // see all staff profiles (without pay)
  | "staff.manage";      // create staff, set pay and passwords

const GRANTS: Record<Action, Role[]> = {
  "job.viewAll": ["boss", "supervisor"],
  "job.create": ["boss", "supervisor"],
  "job.assign": ["boss", "supervisor"],
  "job.editDetails": ["boss", "supervisor"],
  "job.qc": ["boss", "supervisor"],
  "job.handover": ["boss", "supervisor"],
  "job.anyStatus": ["boss", "supervisor"],
  "job.report": ["boss", "supervisor"],
  "money.selling": ["boss", "supervisor"],
  "money.cost": ["boss", "supervisor"],
  "money.labourCost": ["boss"],
  "customer.manage": ["boss", "supervisor"],
  "machine.manage": ["boss", "supervisor"],
  "stock.manage": ["boss", "supervisor"],
  "po.create": ["boss", "supervisor"],
  "po.approve": ["boss"],
  "price.set": ["boss"],
  "staff.view": ["boss", "supervisor"],
  "staff.manage": ["boss"],
};

export function can(role: Role, action: Action): boolean {
  return GRANTS[action].includes(role);
}

/** Whether a person may work on (update tasks, photos, labour, notes of) a job. */
export function canWorkOnJob(user: { id: number; role: Role }, job: { leadId: number | null; teamIds: number[] }): boolean {
  if (can(user.role, "job.viewAll")) return true;
  return job.leadId === user.id || job.teamIds.includes(user.id);
}
