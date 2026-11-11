export type ScheduledSlot = {
  subjectId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isSplit?: boolean | null;
  facultyId?: string | null;
  facultyDisplayName?: string | null;
};

const toMin = (t: string) => {
  const [h, m] = t.split(":").map((v) => parseInt(v, 10));
  return h * 60 + m;
};

/**
 * Hours a class has scheduled, per `groupKey`. Ordinary blocks count once per slot (co-instructor rows share a slot).
 * A SPLIT subject divides the class in two groups, one per instructor, that each take the full hours, possibly at different
 * times: its hours are those of ONE group (the larger), so moving a split block to another time does not count it twice.
 */
export function scheduledMinutes(loads: ScheduledSlot[], groupKey: (l: ScheduledSlot) => string): Map<string, number> {
  const out = new Map<string, number>();
  const seen = new Set<string>();
  const halves = new Map<string, Map<string, Set<string>>>(); // group -> instructor -> slots
  for (const l of loads) {
    if (!l.startTime || !l.endTime) continue;
    const g = groupKey(l);
    const slot = `${l.dayOfWeek}|${l.startTime}|${l.endTime}`;
    if (l.isSplit) {
      const who = l.facultyId ?? `name:${(l.facultyDisplayName ?? "").trim().toLowerCase()}`;
      const byWho = halves.get(g) ?? new Map<string, Set<string>>();
      const slots = byWho.get(who) ?? new Set<string>();
      slots.add(slot);
      byWho.set(who, slots);
      halves.set(g, byWho);
      continue;
    }
    if (seen.has(`${g}|${slot}`)) continue;
    seen.add(`${g}|${slot}`);
    const mins = toMin(l.endTime) - toMin(l.startTime);
    if (!Number.isNaN(mins)) out.set(g, (out.get(g) ?? 0) + mins);
  }
  for (const [g, byWho] of halves) {
    let best = 0;
    for (const slots of byWho.values()) {
      let total = 0;
      for (const slot of slots) {
        const [, start, end] = slot.split("|");
        const mins = toMin(end) - toMin(start);
        if (!Number.isNaN(mins)) total += mins;
      }
      best = Math.max(best, total);
    }
    out.set(g, (out.get(g) ?? 0) + best);
  }
  return out;
}
