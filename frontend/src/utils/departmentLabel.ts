export function departmentLabel(d: { name: string; code: string | null }): string {
  if (!d.code) return d.name;
  return d.name.toUpperCase().includes(`(${d.code.toUpperCase()})`) ? d.name : `${d.name} (${d.code})`;
}