import type { Role } from "@prisma/client";
import { prisma } from "../../prisma/client.js";
import { runUnscoped } from "../../utils/auditContext.js";
import { badRequest, forbidden, notFound } from "../../utils/errors.js";
import { notifyUsers } from "../notifications/notificationService.js";

type Caller = { id: string; role: Role };

/** Roles that belong to a college and so can be a deadline's audience. */
export const COLLEGE_ROLES: Role[] = ["DEAN", "CHAIRMAN", "FACULTY", "OFFICER", "COLLEGE_SECRETARY"];
const MANAGERS: Role[] = ["COLLEGE_SECRETARY", "ADMIN"];

export type DeadlineInput = {
  title: string;
  description?: string | null;
  dueAt: Date;
  audienceRoles: Role[];
  reminderDays: number[];
  reminderHour: number;
};

const clean = (input: DeadlineInput) => ({
  title: input.title.trim(),
  description: input.description?.trim() ? input.description.trim() : null,
  dueAt: input.dueAt,
  audienceRoles: Array.from(new Set(input.audienceRoles.filter((r) => COLLEGE_ROLES.includes(r)))),
  reminderDays: Array.from(new Set(input.reminderDays)).sort((a, b) => b - a),
  reminderHour: input.reminderHour,
});

function view(d: { id: string; title: string; description: string | null; dueAt: Date; audienceRoles: Role[]; reminderDays: number[]; reminderHour: number; createdAt: Date; reminders?: { daysBefore: number; firedAt: Date }[] }) {
  return {
    id: d.id,
    title: d.title,
    description: d.description,
    dueAt: d.dueAt,
    audienceRoles: d.audienceRoles,
    reminderDays: d.reminderDays,
    reminderHour: d.reminderHour,
    createdAt: d.createdAt,
    remindersSent: (d.reminders ?? []).map((r) => r.daysBefore).sort((a, b) => b - a),
  };
}

/**
 * Deadlines of the caller's college that are for them. Managers (the college secretary, the admin) see every one. Past ones
 * stay visible for 30 days. The college is applied by the college scope, so nobody sees another college's deadlines.
 */
export async function listDeadlines(caller: Caller) {
  const manager = MANAGERS.includes(caller.role);
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rows = await prisma.collegeDeadline.findMany({
    where: { dueAt: { gte: since }, ...(manager ? {} : { OR: [{ audienceRoles: { isEmpty: true } }, { audienceRoles: { has: caller.role } }] }) },
    include: { reminders: { select: { daysBefore: true, firedAt: true } } },
    orderBy: { dueAt: "asc" },
    take: 200,
  });
  return rows.map(view);
}

/** The people a deadline is for: everyone in its college (or the chosen roles), without admin, president and unit viewers. */
export async function recipientsOf(deadline: { collegeId: string | null; audienceRoles: Role[] }): Promise<{ id: string; name: string; email: string; emailDeadlines: boolean }[]> {
  if (!deadline.collegeId) return [];
  const roles = deadline.audienceRoles.length > 0 ? deadline.audienceRoles.filter((r) => COLLEGE_ROLES.includes(r)) : COLLEGE_ROLES;
  return runUnscoped(() =>
    prisma.user.findMany({ where: { collegeId: deadline.collegeId, isDeleted: false, role: { in: roles } }, select: { id: true, name: true, email: true, emailDeadlines: true } })
  );
}

const dayLabel = (d: Date) => d.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" });

export async function createDeadline(caller: Caller, input: DeadlineInput) {
  if (!MANAGERS.includes(caller.role)) throw forbidden("Only the college secretary can add deadlines.");
  const data = clean(input);
  if (data.dueAt.getTime() < Date.now() - 86_400_000) throw badRequest("The due date is already in the past.");
  const created = await prisma.collegeDeadline.create({ data: { ...data, createdById: caller.id } });
  // tell the people it is for (the bell; the emails come with the reminders)
  const people = await recipientsOf(created);
  void notifyUsers(people.map((p) => p.id), { type: "DEADLINE", title: `New deadline: ${created.title}`, body: `Due ${dayLabel(created.dueAt)}`, link: "/deadlines" }, { exceptUserId: caller.id });
  return view({ ...created, reminders: [] });
}

export async function updateDeadline(caller: Caller, id: string, input: DeadlineInput) {
  if (!MANAGERS.includes(caller.role)) throw forbidden("Only the college secretary can change deadlines.");
  const existing = await prisma.collegeDeadline.findUnique({ where: { id } });
  if (!existing) throw notFound("Deadline not found");
  const data = clean(input);
  const moved = existing.dueAt.getTime() !== data.dueAt.getTime() || existing.reminderHour !== data.reminderHour;
  const updated = await prisma.collegeDeadline.update({ where: { id }, data });
  // a moved due date (or reminder hour) starts the reminders over; unchanged reminders that were sent stay sent
  if (moved) await runUnscoped(() => prisma.collegeDeadlineReminder.deleteMany({ where: { deadlineId: id } }));
  if (existing.dueAt.getTime() !== data.dueAt.getTime()) {
    const people = await recipientsOf(updated);
    void notifyUsers(people.map((p) => p.id), { type: "DEADLINE", title: `Deadline moved: ${updated.title}`, body: `Now due ${dayLabel(updated.dueAt)}`, link: "/deadlines" }, { exceptUserId: caller.id });
  }
  const reminders = await runUnscoped(() => prisma.collegeDeadlineReminder.findMany({ where: { deadlineId: id }, select: { daysBefore: true, firedAt: true } }));
  return view({ ...updated, reminders });
}

export async function deleteDeadline(caller: Caller, id: string) {
  if (!MANAGERS.includes(caller.role)) throw forbidden("Only the college secretary can remove deadlines.");
  const existing = await prisma.collegeDeadline.findUnique({ where: { id } });
  if (!existing) throw notFound("Deadline not found");
  await prisma.collegeDeadline.delete({ where: { id } });
}
