import { prisma } from "../../prisma/client.js";
import { effectiveMaxUnits, loadDeloadings, loadState, round2, type DeloadSummary, type LoadState } from "../../utils/deloading.js";
import { TEACHING_ROLES } from "../../utils/teachingRoles.js";
import { creditedUnitsByFaculty } from "./dashboardProgress.js";

export interface WorkloadRow {
  id: string;
  name: string;
  role: string;
  status: string | null;
  department: string;
  departmentId: string | null;
  maxUnits: number | null;
  deloadTotal: number;
  deloadItems: DeloadSummary["items"];
  /** Maximum units less deloading; null when no maximum is set. */
  effectiveMax: number | null;
  assignedUnits: number;
  /** assigned - effective maximum: positive = overload, negative = underload. */
  difference: number | null;
  state: LoadState;
}

/**
 * One row per person who can carry a teaching load, with assigned units (lab units count 3x), the
 * maximum less this term's deloading, and whether they are over, under or exactly at it.
 * The single source for the dashboard summary, its detail view and a person's own workload.
 */
export async function loadWorkloadRows(
  scopeDeptId: string | null,
  academicYearId: string,
  semester: number,
  onlyUserId?: string
): Promise<WorkloadRow[]> {
  const users = await prisma.user.findMany({
    where: {
      isDeleted: false,
      role: { in: TEACHING_ROLES },
      ...(scopeDeptId ? { departmentId: scopeDeptId } : {}),
      ...(onlyUserId ? { id: onlyUserId } : {}),
    },
    select: { id: true, name: true, role: true, status: true, maxUnits: true, departmentId: true, department: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  const [units, deloadings] = await Promise.all([
    creditedUnitsByFaculty(academicYearId, semester, onlyUserId ? null : scopeDeptId),
    loadDeloadings(academicYearId, semester, users.map((u) => u.id)),
  ]);
  return users.map((u) => {
    const deload = deloadings.get(u.id) ?? { total: 0, items: [] };
    const assigned = units.get(u.id) ?? 0;
    const effectiveMax = effectiveMaxUnits(u.maxUnits, deload.total);
    return {
      id: u.id,
      name: u.name,
      role: u.role,
      status: u.status,
      department: u.department?.name ?? "—",
      departmentId: u.departmentId,
      maxUnits: u.maxUnits,
      deloadTotal: deload.total,
      deloadItems: deload.items,
      effectiveMax,
      assignedUnits: assigned,
      difference: effectiveMax == null ? null : round2(assigned - effectiveMax),
      state: loadState(assigned, effectiveMax),
    };
  });
}
