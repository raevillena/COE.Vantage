import { prisma } from "../../prisma/client.js";
import { currentActor, runUnscoped } from "../../utils/auditContext.js";
import { badRequest } from "../../utils/errors.js";

/** Read notifications older than this are deleted when their owner opens the list. */
const READ_RETENTION_DAYS = 90;
/** Repeated events of one kind inside this window fold into the unread notification already there. */
const COALESCE_MINUTES = 15;

export interface NotificationSpec {
  /** Machine name of the event kind, e.g. "SCHEDULE", "REQUEST", "FEEDBACK". */
  type: string;
  /** Title, or a function of how many events were folded together. */
  title: string | ((count: number) => string);
  body?: string | null;
  /** App route the notification opens. */
  link?: string | null;
  /** Events with the same key fold into one unread notification instead of piling up. */
  groupKey?: string;
}

export interface NotifyOptions {
  /** The person who caused the event; they are never notified about their own action. */
  exceptUserId?: string | null;
  /** How many events this call stands for (a bulk action counts every block). */
  increment?: number;
}

const titleOf = (spec: NotificationSpec, count: number) => (typeof spec.title === "function" ? spec.title(count) : spec.title);

/**
 * Creates a notification for each user. It is best effort: a failure is logged and never breaks the action
 * that triggered it, so callers do not await it for correctness.
 */
export async function notifyUsers(userIds: Array<string | null | undefined>, spec: NotificationSpec, opts: NotifyOptions = {}): Promise<void> {
  try {
    const ids = [...new Set(userIds.filter((id): id is string => Boolean(id) && id !== opts.exceptUserId))];
    if (ids.length === 0) return;
    const increment = Math.max(1, opts.increment ?? 1);
    const active = await runUnscoped(() => prisma.user.findMany({ where: { id: { in: ids }, isDeleted: false }, select: { id: true } }));
    const since = new Date(Date.now() - COALESCE_MINUTES * 60_000);
    for (const { id: userId } of active) {
      const open = spec.groupKey
        ? await prisma.notification.findFirst({ where: { userId, groupKey: spec.groupKey, readAt: null, updatedAt: { gte: since } } })
        : null;
      if (open) {
        const count = open.count + increment;
        await prisma.notification.update({
          where: { id: open.id },
          data: { count, title: titleOf(spec, count), body: spec.body ?? null, link: spec.link ?? open.link },
        });
      } else {
        await prisma.notification.create({
          data: {
            userId,
            type: spec.type,
            title: titleOf(spec, increment),
            body: spec.body ?? null,
            link: spec.link ?? null,
            groupKey: spec.groupKey ?? null,
            count: increment,
          },
        });
      }
    }
  } catch (e) {
    console.error("notifyUsers failed", e);
  }
}

/** Everyone who may act on cross-department requests for a department: its chairmen. */
export async function chairmenOf(departmentId: string | null | undefined): Promise<string[]> {
  if (!departmentId) return [];
  const rows = await runUnscoped(() => prisma.user.findMany({ where: { role: "CHAIRMAN", departmentId, isDeleted: false }, select: { id: true } }));
  return rows.map((r) => r.id);
}

/** People with these roles: the admin and president always (they span colleges), everyone else only in the signed-in person's college. */
export async function userIdsWithRole(...roles: Array<"ADMIN" | "DEAN" | "CHAIRMAN" | "FACULTY" | "OFFICER" | "COLLEGE_SECRETARY" | "PRESIDENT">): Promise<string[]> {
  const mine = currentActor()?.collegeId;
  const rows = await runUnscoped(() =>
    prisma.user.findMany({
      where: { role: { in: roles }, isDeleted: false, ...(mine ? { OR: [{ collegeId: mine }, { collegeId: null }] } : {}) },
      select: { id: true },
    })
  );
  return rows.map((r) => r.id);
}

/** Every active user, for announcements such as a change of the current term. */
export async function allUserIds(): Promise<string[]> {
  const rows = await runUnscoped(() => prisma.user.findMany({ where: { isDeleted: false }, select: { id: true } }));
  return rows.map((r) => r.id);
}

const SCHEDULE_VERB = { assigned: "assigned to you", changed: "changed", removed: "removed from your schedule" } as const;

/** A teaching block of this person was assigned, changed or removed. Bulk actions pass how many blocks. */
export async function notifyScheduleChange(
  facultyId: string | null | undefined,
  kind: keyof typeof SCHEDULE_VERB,
  detail: string,
  opts: NotifyOptions = {}
): Promise<void> {
  await notifyUsers(
    [facultyId],
    {
      type: "SCHEDULE",
      title: (n) => (n === 1 ? "Your schedule changed" : `Your schedule changed (${n} updates)`),
      body: `${detail} ${SCHEDULE_VERB[kind]}`.trim(),
      link: "/schedules",
      groupKey: "schedule",
    },
    opts
  );
}

export async function listNotifications(userId: string, limit: number) {
  const cutoff = new Date(Date.now() - READ_RETENTION_DAYS * 86_400_000);
  await prisma.notification.deleteMany({ where: { userId, readAt: { not: null, lt: cutoff } } });
  const [items, unread, user] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: limit }),
    prisma.notification.count({ where: { userId, readAt: null } }),
    prisma.user.findUnique({ where: { id: userId }, select: { lastSeenVersion: true } }),
  ]);
  return { items, unread, lastSeenVersion: user?.lastSeenVersion ?? null };
}

export async function markRead(userId: string, id: string) {
  await prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}

export async function removeNotification(userId: string, id: string) {
  await prisma.notification.deleteMany({ where: { id, userId } });
}

/** Remembers the newest release this person has looked at; their bell lists newer ones. */
export async function setSeenVersion(userId: string, version: string) {
  if (!/^v\d+\.\d+\.\d+$/.test(version)) throw badRequest("Version must look like v1.2.3");
  await prisma.user.update({ where: { id: userId }, data: { lastSeenVersion: version } });
}
