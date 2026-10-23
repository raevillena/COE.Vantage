/** Faculty teaching-load credit for a subject: laboratory units count 3x toward a faculty's load and max-units cap. */
export const LAB_LOAD_MULTIPLIER = 3;

export function creditedLoadUnits(units: number, isLab: boolean): number {
  return isLab ? units * LAB_LOAD_MULTIPLIER : units;
}
