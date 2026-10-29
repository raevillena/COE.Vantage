import { AuditList } from "../../components/audit/AuditList";
import { HelpTip } from "../../components/ui/helpTip";

/** Every change to the core records, for the admin, dean and college secretary. */
export function AuditLogPage() {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <h1 className="text-2xl font-semibold text-foreground">Audit log</h1>
        <HelpTip>
          A record of who changed what: academic years and the current term, curricula, subjects, classes, departments, rooms, users, scheduling rules, GE sheets, deloading, and schedules being added or removed. Entries cannot be edited or deleted, and each keeps the name and role the person had at the time.
        </HelpTip>
      </div>
      <AuditList kindFilter />
    </div>
  );
}
