export type IcsBlock = {
  dayOfWeek: number; // 1 = Monday .. 7 = Sunday
  startTime: string; // HH:mm
  endTime: string;
  title: string;
  location?: string | null;
  description?: string | null;
  uid: string;
};

const TZ = "Asia/Manila"; // UTC+8 all year, no daylight saving
const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** RFC 5545 lines are limited to 75 octets; longer ones are folded onto continuation lines. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 74) {
    let cut = 74;
    while (Buffer.byteLength(rest.slice(0, cut)) > 74) cut -= 1;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/** The date (in Manila time) of the next given weekday on or after `from`, as YYYYMMDD. */
export function nextWeekdayDate(dayOfWeek: number, from: Date): string {
  const manila = new Date(from.getTime() + 8 * 3_600_000); // shift so the UTC fields read as Manila clock time
  const today = manila.getUTCDay() === 0 ? 7 : manila.getUTCDay();
  manila.setUTCDate(manila.getUTCDate() + ((dayOfWeek - today + 7) % 7));
  return `${manila.getUTCFullYear()}${pad(manila.getUTCMonth() + 1)}${pad(manila.getUTCDate())}`;
}

/** A calendar file with one weekly event per block, repeating for `weeks` weeks from the next occurrence. */
export function buildIcs(params: { name: string; blocks: IcsBlock[]; weeks?: number; now?: Date }): string {
  const now = params.now ?? new Date();
  const weeks = params.weeks ?? 18;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//COE Vantage//Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(params.name)}`,
    `X-WR-TIMEZONE:${TZ}`,
    "BEGIN:VTIMEZONE",
    `TZID:${TZ}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0800",
    "TZOFFSETTO:+0800",
    "TZNAME:PST",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
  for (const b of params.blocks) {
    const date = nextWeekdayDate(b.dayOfWeek, now);
    const time = (t: string) => t.replace(":", "") + "00";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${b.uid}@coe-vantage`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;TZID=${TZ}:${date}T${time(b.startTime)}`,
      `DTEND;TZID=${TZ}:${date}T${time(b.endTime)}`,
      `RRULE:FREQ=WEEKLY;COUNT=${weeks}`,
      `SUMMARY:${esc(b.title)}`
    );
    if (b.location) lines.push(`LOCATION:${esc(b.location)}`);
    if (b.description) lines.push(`DESCRIPTION:${esc(b.description)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
