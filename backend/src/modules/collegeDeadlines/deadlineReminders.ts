import type { Role } from "@prisma/client";
import { prisma } from "../../prisma/client.js";
import { env } from "../../config/env.js";
import { redis } from "../../config/redis.js";
import { runUnscoped } from "../../utils/auditContext.js";
import { sendMessage } from "../../utils/email.js";
import { buildDeadlineEmail, type DeadlineMailItem } from "../../utils/deadlineEmailTemplate.js";
import { notifyUsers } from "../notifications/notificationService.js";
import { recipientsOf } from "./collegeDeadlineService.js";

const MANILA_HOURS = 8; // Asia/Manila is UTC+8 all year
/** A reminder that is more than this late (the backend was down, or the deadline was made after its time) is dropped, not sent late. */
const CATCH_UP_HOURS = 12;
const RUN_EVERY_MS = 10 * 60 * 1000;
const LOCK = "deadlineReminderLock";

/** The moment a reminder `daysBefore` days ahead of the due day goes out: `hour` o'clock Manila time on that day. */
export function reminderTime(dueAt: Date, daysBefore: number, hour: number): Date {
  const manila = new Date(dueAt.getTime() + MANILA_HOURS * 3_600_000); // UTC fields now read as Manila clock time
  return new Date(Date.UTC(manila.getUTCFullYear(), manila.getUTCMonth(), manila.getUTCDate() - daysBefore, hour - MANILA_HOURS));
}

/** Whole calendar days (Manila) from `now` to the due day. */
export function daysUntil(dueAt: Date, now: Date): number {
  const day = (d: Date) => Math.floor((d.getTime() + MANILA_HOURS * 3_600_000) / 86_400_000);
  return day(dueAt) - day(now);
}

/**
 * Sends the reminders that are due. Each (deadline, days-before) goes out once: it is claimed in the database first.
 * A person gets ONE email listing every deadline that is due for a reminder now, and a bell notification for each.
 * `email: false` only does the bell. `onlyUserIds` limits recipients (tests).
 */
export async function runDeadlineReminders(now = new Date(), opts: { email?: boolean; onlyUserIds?: string[] } = {}): Promise<{ claimed: number; emails: number }> {
  return runUnscoped(async () => {
    const deadlines = await prisma.collegeDeadline.findMany({ where: { dueAt: { gt: now } }, take: 500 });
    type Fired = { deadline: (typeof deadlines)[number]; daysBefore: number };
    const fired: Fired[] = [];
    for (const deadline of deadlines) {
      for (const daysBefore of deadline.reminderDays) {
        const at = reminderTime(deadline.dueAt, daysBefore, deadline.reminderHour);
        const late = (now.getTime() - at.getTime()) / 3_600_000;
        if (at.getTime() >= deadline.dueAt.getTime() || late < 0 || late > CATCH_UP_HOURS) continue;
        try {
          await prisma.collegeDeadlineReminder.create({ data: { deadlineId: deadline.id, daysBefore } }); // unique: only one runner wins
          fired.push({ deadline, daysBefore });
        } catch {
          // already sent
        }
      }
    }
    if (fired.length === 0) return { claimed: 0, emails: 0 };

    // one email per person for everything that fired
    const perPerson = new Map<string, { name: string; email: string; wantsEmail: boolean; items: DeadlineMailItem[] }>();
    const counts = new Map<string, number>();
    for (const { deadline, daysBefore: _d } of fired) {
      const people = (await recipientsOf(deadline)).filter((p) => !opts.onlyUserIds || opts.onlyUserIds.includes(p.id));
      const daysLeft = daysUntil(deadline.dueAt, now);
      for (const p of people) {
        const entry = perPerson.get(p.id) ?? { name: p.name, email: p.email, wantsEmail: p.emailDeadlines, items: [] };
        if (!entry.items.some((i) => i.title === deadline.title && i.dueAt.getTime() === deadline.dueAt.getTime())) {
          entry.items.push({ title: deadline.title, description: deadline.description, dueAt: deadline.dueAt, daysLeft });
        }
        perPerson.set(p.id, entry);
      }
      counts.set(deadline.id, people.length);
      await notifyUsers(
        people.map((p) => p.id),
        {
          type: "DEADLINE",
          title: daysLeft <= 0 ? `Deadline today: ${deadline.title}` : daysLeft === 1 ? `Deadline tomorrow: ${deadline.title}` : `Deadline in ${daysLeft} days: ${deadline.title}`,
          link: "/deadlines",
          groupKey: `deadline:${deadline.id}`,
        }
      );
    }

    let emails = 0;
    if (opts.email) {
      const origin = env.FRONTEND_ORIGIN.replace(/\/$/, "");
      for (const person of perPerson.values()) {
        if (!person.wantsEmail) continue;
        person.items.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
        try {
          await sendMessage({ to: person.email, ...buildDeadlineEmail({ name: person.name, items: person.items, origin }) });
          emails += 1;
        } catch (err) {
          console.error("[Deadlines] could not email", person.email, err instanceof Error ? err.message : err);
        }
      }
    }
    for (const f of fired) {
      await prisma.collegeDeadlineReminder.updateMany({ where: { deadlineId: f.deadline.id, daysBefore: f.daysBefore }, data: { recipients: counts.get(f.deadline.id) ?? 0 } });
    }
    return { claimed: fired.length, emails };
  });
}

/** The periodic runner. The bell reminders always run; the emails need EMAIL_DIGEST=true (the same switch as the digest). */
export function startDeadlineReminders(): void {
  const tick = async () => {
    try {
      if ((await redis.set(LOCK, "1", "EX", Math.floor(RUN_EVERY_MS / 1000) - 30, "NX")) !== "OK") return;
      const r = await runDeadlineReminders(new Date(), { email: env.EMAIL_DIGEST });
      if (r.claimed > 0) console.log(`[Deadlines] sent ${r.claimed} reminder(s), ${r.emails} email(s)`);
    } catch (err) {
      console.error("[Deadlines] run failed", err);
    }
  };
  setTimeout(() => void tick(), 45_000).unref();
  setInterval(() => void tick(), RUN_EVERY_MS).unref();
}

export type { Role };
