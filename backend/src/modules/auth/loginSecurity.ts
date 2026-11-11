import { randomUUID } from "node:crypto";
import { prisma } from "../../prisma/client.js";
import { redis, deleteRefreshToken } from "../../config/redis.js";
import { AppError, notFound } from "../../utils/errors.js";
import { runUnscoped } from "../../utils/auditContext.js";

export type ClientMeta = { ip: string | null; userAgent: string | null };

// ---------------------------------------------------------------- failed-attempt lockout
// Counted per (email, IP) so a stranger cannot lock someone out from another address, and per IP so one address cannot try
// many accounts. A correct sign-in clears the (email, IP) counter. Redis being down never blocks anyone from signing in.

const WINDOW_SECONDS = 15 * 60;
const MAX_FAILURES_PER_ACCOUNT = 5;
const MAX_FAILURES_PER_IP = 100; // generous: a whole campus can sit behind one address
const accountKey = (email: string, ip: string | null) => `loginfail:${email.trim().toLowerCase()}:${ip ?? "?"}`;
const ipKey = (ip: string | null) => `loginfail:ip:${ip ?? "?"}`;

export async function assertNotLocked(email: string, meta: ClientMeta): Promise<void> {
  try {
    const [account, ip] = await Promise.all([redis.get(accountKey(email, meta.ip)), redis.get(ipKey(meta.ip))]);
    if (Number(account ?? 0) >= MAX_FAILURES_PER_ACCOUNT || Number(ip ?? 0) >= MAX_FAILURES_PER_IP) {
      const ttl = Math.max(await redis.ttl(accountKey(email, meta.ip)), await redis.ttl(ipKey(meta.ip)), 60);
      throw new AppError(`Too many failed sign-in attempts. Try again in ${Math.ceil(ttl / 60)} minute${ttl > 60 ? "s" : ""}.`, 429);
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
  }
}

export async function recordFailure(email: string, meta: ClientMeta): Promise<void> {
  try {
    for (const key of [accountKey(email, meta.ip), ipKey(meta.ip)]) {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, WINDOW_SECONDS);
    }
  } catch {
    // fail open
  }
}

export async function clearFailures(email: string, meta: ClientMeta): Promise<void> {
  try {
    await redis.del(accountKey(email, meta.ip));
  } catch {
    // fail open
  }
}

// ---------------------------------------------------------------- login history
export async function logLoginEvent(event: { userId?: string | null; email: string; success: boolean; method: "password" | "google"; reason?: string; meta: ClientMeta }): Promise<void> {
  try {
    await runUnscoped(() =>
      prisma.loginEvent.create({
        data: {
          userId: event.userId ?? null,
          email: event.email.trim().toLowerCase().slice(0, 254),
          success: event.success,
          method: event.method,
          reason: event.reason ?? null,
          ip: event.meta.ip?.slice(0, 64) ?? null,
          userAgent: event.meta.userAgent?.slice(0, 300) ?? null,
        },
      })
    );
    if (Math.random() < 0.02) {
      const cutoff = new Date(Date.now() - 90 * 24 * 3_600_000);
      await runUnscoped(() => prisma.loginEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }));
    }
  } catch (err) {
    console.error("[Login] could not record the sign-in event", err instanceof Error ? err.message : err);
  }
}

export function myLoginHistory(userId: string) {
  return runUnscoped(() =>
    prisma.loginEvent.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, success: true, method: true, ip: true, userAgent: true, createdAt: true } })
  );
}

/** Recent failures and successes across all accounts, for an administrator. */
export function recentLoginEvents(limit: number, onlyFailures: boolean) {
  return runUnscoped(() =>
    prisma.loginEvent.findMany({ where: onlyFailures ? { success: false } : {}, orderBy: { createdAt: "desc" }, take: Math.min(Math.max(limit, 1), 200) })
  );
}

// ---------------------------------------------------------------- signed-in sessions
// A session is one browser's sign-in. Its id stays the same while the refresh token rotates. Ending a session deletes its
// record and its current refresh token, so it cannot get a new access token (an access token already issued still works
// until it expires, 15 minutes at most).

const SESSION_TTL = 7 * 24 * 60 * 60;
type SessionRecord = { userId: string; tokenId: string; createdAt: string; lastSeenAt: string; ip: string | null; userAgent: string | null };
const sessionKey = (sid: string) => `session:${sid}`;
const userSessionsKey = (userId: string) => `usersessions:${userId}`;

export async function createSession(userId: string, tokenId: string, meta: ClientMeta): Promise<string> {
  const sid = randomUUID();
  const now = new Date().toISOString();
  const record: SessionRecord = { userId, tokenId, createdAt: now, lastSeenAt: now, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300) ?? null };
  await redis.setex(sessionKey(sid), SESSION_TTL, JSON.stringify(record));
  await redis.sadd(userSessionsKey(userId), sid);
  await redis.expire(userSessionsKey(userId), SESSION_TTL);
  return sid;
}

async function readSession(sid: string): Promise<SessionRecord | null> {
  const raw = await redis.get(sessionKey(sid));
  return raw ? (JSON.parse(raw) as SessionRecord) : null;
}

export const sessionExists = async (sid: string) => (await redis.exists(sessionKey(sid))) === 1;

/** After a refresh: remember the new token id and when the browser was last seen. */
export async function touchSession(sid: string, tokenId: string, meta: ClientMeta): Promise<void> {
  const record = await readSession(sid);
  if (!record) return;
  record.tokenId = tokenId;
  record.lastSeenAt = new Date().toISOString();
  record.ip = meta.ip ?? record.ip;
  await redis.setex(sessionKey(sid), SESSION_TTL, JSON.stringify(record));
}

export async function listSessions(userId: string, currentSid: string | null) {
  const sids = await redis.smembers(userSessionsKey(userId));
  const out: { id: string; current: boolean; createdAt: string; lastSeenAt: string; ip: string | null; userAgent: string | null }[] = [];
  for (const sid of sids) {
    const record = await readSession(sid);
    if (!record || record.userId !== userId) {
      await redis.srem(userSessionsKey(userId), sid);
      continue;
    }
    out.push({ id: sid, current: sid === currentSid, createdAt: record.createdAt, lastSeenAt: record.lastSeenAt, ip: record.ip, userAgent: record.userAgent });
  }
  return out.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

export async function endSession(sid: string, userId: string): Promise<void> {
  const record = await readSession(sid);
  if (!record || record.userId !== userId) throw notFound("Session not found");
  await deleteRefreshToken(record.tokenId);
  await redis.del(sessionKey(sid));
  await redis.srem(userSessionsKey(userId), sid);
}

export async function endOtherSessions(userId: string, keepSid: string | null): Promise<number> {
  let ended = 0;
  for (const sid of await redis.smembers(userSessionsKey(userId))) {
    if (sid === keepSid) continue;
    try {
      await endSession(sid, userId);
      ended += 1;
    } catch {
      await redis.srem(userSessionsKey(userId), sid);
    }
  }
  return ended;
}
