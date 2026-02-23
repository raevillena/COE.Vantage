import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { prisma } from "../../prisma/client.js";
import { setRefreshToken, getRefreshToken, deleteRefreshToken } from "../../config/redis.js";
import { env } from "../../config/env.js";
import { badRequest, unauthorized } from "../../utils/errors.js";
import type { LoginBody, RegisterBody } from "./authSchemas.js";

/** Payload we store in the access token (sub = userId). */
export interface AccessPayload {
  sub: string;
}

/** Issue access token (short-lived). */
export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_ACCESS_SECRET, {
    expiresIn: 15 * 60, // 15 minutes
  });
}

/** Issue refresh token id (opaque); we store it in Redis with userId. */
export function createRefreshTokenId(): string {
  return randomUUID();
}

/** Store refresh token in Redis and return the token string for the cookie. */
export async function issueRefreshToken(userId: string): Promise<string> {
  const tokenId = createRefreshTokenId();
  await setRefreshToken(tokenId, userId);
  return jwt.sign({ sub: userId, tokenId }, env.JWT_REFRESH_SECRET, {
    expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
  });
}

/** Verify refresh token from cookie and return userId if valid. */
export async function verifyRefreshToken(token: string): Promise<string> {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as { sub: string; tokenId?: string };
  const tokenId = payload.tokenId ?? payload.sub;
  const storedUserId = await getRefreshToken(tokenId);
  if (!storedUserId || storedUserId !== payload.sub) {
    throw unauthorized("Invalid or expired refresh token");
  }
  return payload.sub;
}

/** Revoke refresh token (logout or rotate). */
export async function revokeRefreshToken(token: string): Promise<void> {
  try {
    const payload = jwt.decode(token) as { tokenId?: string; sub?: string } | null;
    if (payload?.tokenId) await deleteRefreshToken(payload.tokenId);
  } catch {
    // ignore
  }
}

export async function login(body: LoginBody): Promise<{ accessToken: string; refreshToken: string; user: { id: string; email: string; role: string; name: string; departmentId: string | null } }> {
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user) throw unauthorized("Invalid email or password");
  const valid = await bcrypt.compare(body.password, user.passwordHash);
  if (!valid) throw unauthorized("Invalid email or password");

  const accessToken = signAccessToken(user.id);
  const refreshToken = await issueRefreshToken(user.id);
  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      departmentId: user.departmentId,
    },
  };
}

/** Refresh: validate cookie, optionally revoke old token, issue new access + refresh. */
export async function refresh(refreshTokenFromCookie: string): Promise<{ accessToken: string; refreshToken: string }> {
  const userId = await verifyRefreshToken(refreshTokenFromCookie);
  await revokeRefreshToken(refreshTokenFromCookie);
  const accessToken = signAccessToken(userId);
  const refreshToken = await issueRefreshToken(userId);
  return { accessToken, refreshToken };
}

export async function logout(refreshTokenFromCookie: string | undefined): Promise<void> {
  if (refreshTokenFromCookie) await revokeRefreshToken(refreshTokenFromCookie);
}

export async function register(body: RegisterBody): Promise<{ id: string; email: string; role: string; name: string; departmentId: string | null }> {
  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) throw badRequest("Email already registered");

  if (body.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: body.departmentId } });
    if (!dept) throw badRequest("Department not found");
  }

  const passwordHash = await bcrypt.hash(body.password, 12);
  const user = await prisma.user.create({
    data: {
      email: body.email,
      passwordHash,
      name: body.name,
      role: body.role,
      departmentId: body.departmentId ?? undefined,
    },
    select: { id: true, email: true, role: true, name: true, departmentId: true },
  });
  return user;
}
