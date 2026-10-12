import type { AssignableFaculty } from "../../types/api";

export interface FacultyGroup {
  key: string;
  label: string;
  items: AssignableFaculty[];
}

/** Groups an already-sorted list by department, preserving the server order (own department first). */
export function groupFacultyByDepartment(list: AssignableFaculty[], ownDepartmentId: string | null): FacultyGroup[] {
  const groups: FacultyGroup[] = [];
  const index = new Map<string, number>();
  for (const f of list) {
    const key = f.departmentId ?? "__none__";
    let i = index.get(key);
    if (i === undefined) {
      i = groups.length;
      index.set(key, i);
      const deptName = f.department?.name ?? "No department";
      groups.push({
        key,
        label: ownDepartmentId && f.departmentId === ownDepartmentId ? `${deptName} (your department)` : `${deptName} · requires approval`,
        items: [],
      });
    }
    groups[i].items.push(f);
  }
  return groups;
}

export function facultyRoleSuffix(role: string): string {
  return role === "CHAIRMAN" ? " (Chair)" : role === "DEAN" ? " (Dean)" : "";
}