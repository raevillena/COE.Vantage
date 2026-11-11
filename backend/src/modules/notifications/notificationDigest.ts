import { prisma } from "../../prisma/client.js";
import { env } from "../../config/env.js";
import { redis } from "../../config/redis.js";
import { runUnscoped } from "../../utils/auditContext.js";
import { sendMessage } from "../../utils/email.js";
import { buildDigestEmail } from "../../utils/notificationDigestTemplate.js";

/** A notification must have been waiting this long (unread) before it is emailed: most are read in the app within minutes. */
const MIN_AGE_MINUTES = 60;
/** At most one digest per person in this time. */
const MIN_GAP_HOURS = 24;
/** Emails per run, so a backlog never turns into a burst (the transport also sends 1 a second). */
const MAX_PER_RUN = 50;
const RUN_EVERY_MS = 30 * 60 * 1000;
const LOCK = "notificationDigestLock";

/** Emails each person their unread, not yet emailed notifications. Returns how many emails it sent. `onlyUserIds` limits it to those people (used by tests). */
export async function runDigestOnce(now = new Date(), onlyUserIds?: string[]): Promise<number> {
  const olderThan = new Date(now.getTime() - MIN_AGE_MINUTES * 60_000);
  const gapStart = new Date(now.getTime() - MIN_GAP_HOURS * 3_600_000);
  return runUnscoped(async () => {
    const waiting = await prisma.notification.findMany({
      where: { readAt: null, emailedAt: null, createdAt: { lte: olderThan }, ...(onlyUserIds ? { userId: { in: onlyUserIds } } : {}), user: { isDeleted: false, emailDigest: true } },
      orderBy: { createdAt: "asc" },
      select: { id: true, userId: true, title: true, body: true, link: true, user: { select: { name: true, email: true } } },
      take: 500,
    });
    const byUser = new Map<string, typeof waiting>();
    for (const n of waiting) byUser.set(n.userId, [...(byUser.get(n.userId) ?? []), n]);

    let sent = 0;
    for (const [userId, items] of byUser) {
      if (sent >= MAX_PER_RUN) break;
      const recent = await prisma.notification.count({ where: { userId, emailedAt: { gte: gapStart } } });
      if (recent > 0) continue; // already had a digest today
      const { user } = items[0];
      const mail = buildDigestEmail({
        name: user.name,
        items: items.slice(0, 15).map((i) => ({ title: i.title, body: i.body, link: i.link })),
        origin: env.FRONTEND_ORIGIN.replace(/\/$/, ""),
      });
      try {
        if ((await sendMessage({ to: user.email, ...mail })) !== "sent") continue; // no SMTP: leave them for when it is set up
        await prisma.notification.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { emailedAt: new Date() } });
        sent += 1;
      } catch (err) {
        console.error("[Digest] could not email", user.email, err instanceof Error ? err.message : err);
      }
    }
    return sent;
  });
}

/** Starts the periodic digest when EMAIL_DIGEST=true. A Redis lock keeps several backend replicas from each running it. */
export function startNotificationDigest(): void {
  if (!env.EMAIL_DIGEST) return;
  const tick = async () => {
    try {
      if ((await redis.set(LOCK, "1", "EX", Math.floor(RUN_EVERY_MS / 1000) - 60, "NX")) !== "OK") return;
      const sent = await runDigestOnce();
      if (sent > 0) console.log(`[Digest] emailed ${sent} notification digest(s)`);
    } catch (err) {
      console.error("[Digest] run failed", err);
    }
  };
  setTimeout(() => void tick(), 60_000).unref();
  setInterval(() => void tick(), RUN_EVERY_MS).unref();
  console.log("[Digest] email digest is on");
}
