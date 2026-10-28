/** Faculty teaching-load credit for a subject: laboratory units count 3x toward a faculty's load and max-units cap. */
export const LAB_LOAD_MULTIPLIER = 3;

/** A subject's two components: lecture units (1 hour/week each) and laboratory units (3 hours/week each). */
export interface SubjectComponents {
  lecUnits: number;
  labUnits: number;
}

/** Weekly contact hours of a subject. It is also its credited load: 3 lec + 1 lab = 3 + 3 = 6. */
export function creditedLoadUnits(s?: SubjectComponents | null): number {
  return s ? s.lecUnits + s.labUnits * LAB_LOAD_MULTIPLIER : 0;
}

interface UnitFields {
  units: number;
  isLab: boolean;
  lecUnits: number;
  labUnits: number;
}

/**
 * Works out the stored unit fields from what a request sent. Callers may send the components (lecUnits, labUnits)
 * or the older units + isLab pair (all lecture, or all laboratory). `units` is the total of the components and
 * `isLab` means a pure laboratory subject, which is the only kind that needs a laboratory room.
 * Returns undefined when the request has no unit information (nothing to change).
 */
export function resolveSubjectUnits(
  input: { units?: number; isLab?: boolean; lecUnits?: number; labUnits?: number },
  current?: UnitFields
): UnitFields | undefined {
  let lecUnits: number;
  let labUnits: number;
  if (input.lecUnits !== undefined || input.labUnits !== undefined) {
    lecUnits = input.lecUnits ?? current?.lecUnits ?? 0;
    labUnits = input.labUnits ?? current?.labUnits ?? 0;
  } else if (input.units !== undefined || input.isLab !== undefined) {
    const units = input.units ?? current?.units ?? 0;
    const isLab = input.isLab ?? current?.isLab ?? false;
    lecUnits = isLab ? 0 : units;
    labUnits = isLab ? units : 0;
  } else {
    return undefined;
  }
  return { units: lecUnits + labUnits, lecUnits, labUnits, isLab: lecUnits === 0 && labUnits > 0 };
}
