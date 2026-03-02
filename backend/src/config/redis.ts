import Redis from "ioredis";
import { env } from "./env.js";

const globalForRedis = globalThis as unknown as { redis: Redis | undefined };

export const redis =
  globalForRedis.redis ??
  new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      return Math.min(times * 100, 3000);
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

/** Store refresh token in Redis with TTL (7 days). Key: refreshTokenId. */
export async function setRefreshToken(tokenId: string, userId: string): Promise<void> {
  await redis.setex(`refresh:${tokenId}`, 60 * 60 * 24 * 7, userId);
}

/** Get userId for a refresh token; returns null if missing or expired. */
export async function getRefreshToken(tokenId: string): Promise<string | null> {
  return redis.get(`refresh:${tokenId}`);
}

/** Revoke a refresh token (e.g. on logout or rotate). */
export async function deleteRefreshToken(tokenId: string): Promise<void> {
  await redis.del(`refresh:${tokenId}`);
}

const PASSWORD_RESET_TTL = 60 * 60; // 1 hour

/** Store password reset token. Key: passwordReset:token, value: userId. */
export async function setPasswordResetToken(token: string, userId: string): Promise<void> {
  await redis.setex(`passwordReset:${token}`, PASSWORD_RESET_TTL, userId);
}

/** Get userId for a password reset token; null if missing or expired. */
export async function getPasswordResetToken(token: string): Promise<string | null> {
  return redis.get(`passwordReset:${token}`);
}

/** Invalidate a password reset token after use. */
export async function deletePasswordResetToken(token: string): Promise<void> {
  await redis.del(`passwordReset:${token}`);
}