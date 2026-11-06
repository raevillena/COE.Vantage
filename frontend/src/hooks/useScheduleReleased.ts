import { useEffect, useState } from "react";
import { apiClient } from "../api/apiClient";

/**
 * Whether the schedules of a term are shown to a faculty member yet: only once the college has finalised (locked) it.
 * Returns true for everyone else, and null while the answer is on its way.
 */
export function useScheduleReleased(enabled: boolean, academicYearId: string, semester: number): boolean | null {
  const [released, setReleased] = useState<boolean | null>(enabled ? null : true);
  useEffect(() => {
    if (!enabled) {
      setReleased(true);
      return;
    }
    if (!academicYearId) {
      setReleased(null);
      return;
    }
    let cancelled = false;
    setReleased(null);
    apiClient
      .get<{ released: boolean }>("/reports/my/released", { params: { academicYearId, semester } })
      .then(({ data }) => !cancelled && setReleased(data.released))
      .catch(() => !cancelled && setReleased(false));
    return () => {
      cancelled = true;
    };
  }, [enabled, academicYearId, semester]);
  return released;
}
