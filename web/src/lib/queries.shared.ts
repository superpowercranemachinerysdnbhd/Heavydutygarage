import type { Role } from "./permissions";
export function isRole(r: string): r is Role {
  return ["boss", "supervisor", "mechanic", "assistant", "fabricator", "painter", "cleaner"].includes(r);
}
