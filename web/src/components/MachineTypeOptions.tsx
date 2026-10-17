import type { T } from "@/i18n";
import { groupLabel, machineGroups, machineTypeLabel } from "@/lib/machine-types";

/** <optgroup>s of machine types from the editable list. `groupChoice` adds a "whole group" option (filters). */
export default function MachineTypeOptions({ t, groupChoice, keep }: { t: T; groupChoice?: boolean; keep?: string | null }) {
  const groups = machineGroups();
  const known = groups.some((g) => g.types.includes(keep ?? ""));
  return (<>
    {groups.map((g) => (
      <optgroup key={g.group} label={groupLabel(t, g.group)}>
        {groupChoice && <option value={g.group}>{groupLabel(t, g.group)} ({t("mach.all")})</option>}
        {g.types.map((k) => <option key={k} value={k}>{machineTypeLabel(t, k)}</option>)}
      </optgroup>
    ))}
    {keep && !known && <option value={keep}>{machineTypeLabel(t, keep)}</option>}
  </>);
}
