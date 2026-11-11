import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../prisma/client.js";
import { setRefreshToken, getRefreshToken, deleteRefreshToken } from "../../config/redis.js";
import {
  setPasswordResetToken,
  getPasswordResetToken,
  deletePasswordResetToken,
} from "../../config/redis.js";
import { OAuth2Client } from "google-auth-library";
import { env } from "../../config/env.js";
import { sendPasswordResetEmail as sendEmail } from "../../utils/email.js";
import { badRequest, unauthorized } from "../../utils/errors.js";
import {
  assertNotLocked,
  clearFailures,
  createSession,
  endSession,
  logLoginEvent,
  recordFailure,
  sessionExists,
  touchSession,
  type ClientMeta,
} from "./loginSecurity.js";
import type {
  LoginBody,
  RegisterBody,
  RequestPasswordResetBody,
  ResetPasswordBody,
  UpdateExperimentalFeaturesBody,
} from "./authSchemas.js";
import {
  EXPERIMENTAL_FEATURE_ROLES,
  normalizeExperimentalFeatures,
  type ExperimentalFeatureKey,
  type ExperimentalFeaturesPreference,
} from "./experimentalFeatures.js";

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
export async function issueRefreshToken(userId: string, meta: ClientMeta = { ip: null, userAgent: null }, sessionId?: string): Promise<string> {
  const tokenId = createRefreshTokenId();
  await setRefreshToken(tokenId, userId);
  const sid = sessionId ?? (await createSession(userId, tokenId, meta));
  if (sessionId) await touchSession(sessionId, tokenId, meta);
  return jwt.sign({ sub: userId, tokenId, sid }, env.JWT_REFRESH_SECRET, {
    expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
  });
}

/** The session id inside a refresh token (null for tokens issued before sessions existed). */
export function sessionIdOf(token: string | undefined): string | null {
  if (!token) return null;
  try {
    return (jwt.decode(token) as { sid?: string } | null)?.sid ?? null;
  } catch {
    return null;
  }
}

/** Verify refresh token from cookie and return userId if valid. */
export async function verifyRefreshToken(token: string): Promise<string> {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as { sub: string; tokenId?: string; sid?: string };
  const tokenId = payload.tokenId ?? payload.sub;
  const storedUserId = await getRefreshToken(tokenId);
  if (!storedUserId || storedUserId !== payload.sub) {
    throw unauthorized("Invalid or expired refresh token");
  }
  if (payload.sid && !(await sessionExists(payload.sid))) throw unauthorized("This session was signed out.");
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

type AuthUserPayload = {
  id: string;
  email: string;
  role: string;
  name: string;
  departmentId: string | null;
  avatarVersion: number | null;
  unitColleges: string[];
  unitAreas: string[];
  experimentalFeatures: ExperimentalFeaturesPreference;
};

type Session = { accessToken: string; refreshToken: string; user: AuthUserPayload };
type UserWithAvatar = Prisma.UserGetPayload<{ include: { avatar: { select: { updatedAt: true } } } }>;

const NO_CLIENT: ClientMeta = { ip: null, userAgent: null };

export async function login(body: LoginBody, meta: ClientMeta = NO_CLIENT): Promise<Session> {
  await assertNotLocked(body.email, meta);
  const user = await prisma.user.findUnique({ where: { email: body.email }, include: { avatar: { select: { updatedAt: true } } } });
  const valid = user && !user.isDeleted ? await bcrypt.compare(body.password, user.passwordHash) : false;
  if (!user || user.isDeleted || !valid) {
    await recordFailure(body.email, meta);
    await logLoginEvent({ userId: user?.id, email: body.email, success: false, method: "password", reason: !user || user.isDeleted ? "unknown_account" : "bad_password", meta });
    throw unauthorized("Invalid email or password");
  }
  await clearFailures(body.email, meta);
  await logLoginEvent({ userId: user.id, email: user.email, success: true, method: "password", meta });
  return startSession(user, meta);
}

// ---------------------------------------------------------------- Google sign-in
// Only for accounts that already exist: the Google address must be verified, in the allowed domain (mmsu.edu.ph) and equal to
// the email the account is registered with. Nothing is ever created here, and an account's password is not touched.

export function googleSignInConfig(): { enabled: boolean; clientId: string | null; domain: string } {
  return { enabled: Boolean(env.GOOGLE_CLIENT_ID), clientId: env.GOOGLE_CLIENT_ID ?? null, domain: env.GOOGLE_ALLOWED_DOMAIN };
}

let googleClient: OAuth2Client | null = null;

/** The profile Google vouches for, or an unauthorized error. Split out so the rules below can be tested without Google. */
export async function verifyGoogleCredential(credential: string): Promise<{ email: string; emailVerified: boolean; hostedDomain: string | null }> {
  if (!env.GOOGLE_CLIENT_ID) throw badRequest("Google sign-in is not set up.");
  googleClient ??= new OAuth2Client(env.GOOGLE_CLIENT_ID);
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: env.GOOGLE_CLIENT_ID });
    const p = ticket.getPayload();
    if (!p?.email) throw new Error("no email");
    return { email: p.email, emailVerified: p.email_verified === true, hostedDomain: typeof p.hd === "string" ? p.hd : null };
  } catch {
    throw unauthorized("Google sign-in could not be verified. Please try again.");
  }
}

export async function loginWithGoogleProfile(profile: { email: string; emailVerified: boolean; hostedDomain: string | null }, meta: ClientMeta = NO_CLIENT): Promise<Session> {
  await assertNotLocked(profile.email, meta);
  try {
    const session = await googleProfileSession(profile, meta);
    await logLoginEvent({ userId: session.user.id, email: session.user.email, success: true, method: "google", meta });
    return session;
  } catch (err) {
    await recordFailure(profile.email, meta);
    await logLoginEvent({ email: profile.email, success: false, method: "google", reason: err instanceof Error ? err.message.slice(0, 80) : "refused", meta });
    throw err;
  }
}

async function googleProfileSession(profile: { email: string; emailVerified: boolean; hostedDomain: string | null }, meta: ClientMeta): Promise<Session> {
  const domain = env.GOOGLE_ALLOWED_DOMAIN.toLowerCase();
  const email = profile.email.trim().toLowerCase();
  if (!profile.emailVerified) throw unauthorized("That Google email is not verified.");
  if (!email.endsWith(`@${domain}`) || (profile.hostedDomain && profile.hostedDomain.toLowerCase() !== domain)) {
    throw unauthorized(`Use your @${domain} Google account.`);
  }
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, isDeleted: false },
    include: { avatar: { select: { updatedAt: true } } },
  });
  if (!user) throw unauthorized(`No Vantage account uses ${email}. Ask an administrator to add it.`);
  return startSession(user, meta);
}

export async function loginWithGoogle(credential: string, meta: ClientMeta = NO_CLIENT): Promise<Session> {
  return loginWithGoogleProfile(await verifyGoogleCredential(credential), meta);
}

async function startSession(user: UserWithAvatar, meta: ClientMeta): Promise<Session> {
  const accessToken = signAccessToken(user.id);
  const refreshToken = await issueRefreshToken(user.id, meta);
  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      departmentId: user.departmentId,
      avatarVersion: user.avatar?.updatedAt.getTime() ?? null,
      unitColleges: user.unitColleges,
      unitAreas: user.unitAreas,
      experimentalFeatures: normalizeExperimentalFeatures(user.experimentalFeatures, user.role),
    },
  };
}

/** Refresh: validate cookie, optionally revoke old token, issue new access + refresh. */
export async function refresh(refreshTokenFromCookie: string, meta: ClientMeta = NO_CLIENT): Promise<{ accessToken: string; refreshToken: string }> {
  const userId = await verifyRefreshToken(refreshTokenFromCookie);
  const sid = sessionIdOf(refreshTokenFromCookie) ?? undefined;
  await revokeRefreshToken(refreshTokenFromCookie);
  const accessToken = signAccessToken(userId);
  const refreshToken = await issueRefreshToken(userId, meta, sid);
  return { accessToken, refreshToken };
}

export async function logout(refreshTokenFromCookie: string | undefined): Promise<void> {
  const sid = sessionIdOf(refreshTokenFromCookie);
  if (refreshTokenFromCookie) await revokeRefreshToken(refreshTokenFromCookie);
  if (sid) {
    try {
      const userId = (jwt.decode(refreshTokenFromCookie!) as { sub?: string } | null)?.sub;
      if (userId) await endSession(sid, userId);
    } catch {
      // already gone
    }
  }
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

export type EmailPreferences = { digest: boolean; deadlines: boolean };

export async function getMyEmailPreferences(userId: string): Promise<EmailPreferences> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { emailDigest: true, emailDeadlines: true } });
  return { digest: user?.emailDigest ?? false, deadlines: user?.emailDeadlines ?? true };
}

/** Changes only the switches that are given. The bell notifications are not affected: they always show. */
export async function setMyEmailPreferences(userId: string, prefs: Partial<EmailPreferences>): Promise<EmailPreferences> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { ...(prefs.digest !== undefined ? { emailDigest: prefs.digest } : {}), ...(prefs.deadlines !== undefined ? { emailDeadlines: prefs.deadlines } : {}) },
    select: { emailDigest: true, emailDeadlines: true },
  });
  return { digest: user.emailDigest, deadlines: user.emailDeadlines };
}

export async function getMyEmailDigest(userId: string): Promise<{ enabled: boolean }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { emailDigest: true } });
  return { enabled: user?.emailDigest ?? false };
}

export async function setMyEmailDigest(userId: string, enabled: boolean): Promise<{ enabled: boolean }> {
  const user = await prisma.user.update({ where: { id: userId }, data: { emailDigest: enabled }, select: { emailDigest: true } });
  return { enabled: user.emailDigest };
}

export async function getMyExperimentalFeatures(userId: string): Promise<ExperimentalFeaturesPreference> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { experimentalFeatures: true, isDeleted: true, role: true },
  });
  if (!user || user.isDeleted) throw unauthorized("User not found");
  return normalizeExperimentalFeatures(user.experimentalFeatures, user.role);
}

export type ExtensionAccess =
  | { allowed: true; user: { name: string; email: string }; appUrl: string }
  | { allowed: false; reason: "signed_out" | "role" | "not_granted" | "not_enabled"; user?: { name: string; email: string }; appUrl: string };

/**
 * Lets the Portal Insert Grade browser extension ask "may the person signed in to Vantage in this browser use me?".
 * It reads the Vantage login cookie but does not rotate it (the extension must never log the web app out) and hands
 * back no token, only the answer. Access = the role fits, an administrator granted the feature and the person switched it on.
 */
export async function getExtensionAccess(refreshTokenFromCookie: string | undefined, feature: ExperimentalFeatureKey): Promise<ExtensionAccess> {
  const appUrl = env.FRONTEND_ORIGIN;
  if (!refreshTokenFromCookie) return { allowed: false, reason: "signed_out", appUrl };
  let userId: string;
  try {
    userId = await verifyRefreshToken(refreshTokenFromCookie);
  } catch {
    return { allowed: false, reason: "signed_out", appUrl };
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, role: true, isDeleted: true, experimentalFeatures: true } });
  if (!user || user.isDeleted) return { allowed: false, reason: "signed_out", appUrl };
  const who = { name: user.name, email: user.email };
  if (!EXPERIMENTAL_FEATURE_ROLES[feature].includes(user.role)) return { allowed: false, reason: "role", user: who, appUrl };
  const prefs = normalizeExperimentalFeatures(user.experimentalFeatures, user.role);
  if (!prefs.granted.includes(feature)) return { allowed: false, reason: "not_granted", user: who, appUrl };
  if (!prefs.enabled || !prefs.features.includes(feature)) return { allowed: false, reason: "not_enabled", user: who, appUrl };
  return { allowed: true, user: who, appUrl };
}

/** Administrator: what experiments one user may switch on (their own switches inside it are kept). */
export async function getUserExperimentalGrants(userId: string): Promise<ExperimentalFeaturesPreference> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { experimentalFeatures: true, isDeleted: true, role: true } });
  if (!user || user.isDeleted) throw badRequest("User not found");
  return normalizeExperimentalFeatures(user.experimentalFeatures, user.role);
}

export async function setUserExperimentalGrants(
  userId: string,
  granted: ExperimentalFeaturesPreference["granted"]
): Promise<ExperimentalFeaturesPreference> {
  const current = await getUserExperimentalGrants(userId);
  const unique = Array.from(new Set(granted));
  const next = { enabled: current.enabled, features: current.features.filter((feature) => unique.includes(feature)), granted: unique };
  await prisma.user.update({ where: { id: userId }, data: { experimentalFeatures: next as unknown as Prisma.InputJsonValue } });
  return next;
}

export async function updateMyExperimentalFeatures(
  userId: string,
  body: UpdateExperimentalFeaturesBody
): Promise<ExperimentalFeaturesPreference> {
  const current = await getMyExperimentalFeatures(userId);
  const next: ExperimentalFeaturesPreference = {
    enabled: body.enabled ?? current.enabled,
    // A user can only switch on what an administrator granted.
    features: (body.features ?? current.features).filter((feature) => current.granted.includes(feature)),
    granted: current.granted,
  };

  await prisma.user.update({
    where: { id: userId },
    data: { experimentalFeatures: next as unknown as Prisma.InputJsonValue },
  });

  return next;
}

/** Build the reset link for a token (used in email and dev log). */
function buildResetLink(token: string): string {
  const base = env.RESET_PASSWORD_BASE_URL ?? env.FRONTEND_ORIGIN;
  return `${base.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
}

/** Authenticated user requests password reset: verify current password, create token, send email. */
export async function requestPasswordReset(
  userId: string,
  body: RequestPasswordResetBody
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.isDeleted) throw unauthorized("User not found");
  const valid = await bcrypt.compare(body.currentPassword, user.passwordHash);
  if (!valid) throw unauthorized("Current password is incorrect");
  const token = randomUUID();
  await setPasswordResetToken(token, userId);
  const link = buildResetLink(token);
  await sendEmail(user.email, link);
}

/** Admin sends password reset email to a user by email address. */
export async function sendPasswordResetEmailForUser(email: string): Promise<void> {
  const user = await prisma.user.findFirst({ where: { email, isDeleted: false } });
  if (!user) throw badRequest("No user found with that email");
  const token = randomUUID();
  await setPasswordResetToken(token, user.id);
  const link = buildResetLink(token);
  await sendEmail(user.email, link);
}

/**
 * Public forgot-password request from login page.
 * Always returns success semantics to avoid exposing whether an email exists.
 */
export async function requestPasswordResetByEmail(email: string): Promise<void> {
  const normalized = email.trim();
  if (!normalized) return;
  const user = await prisma.user.findFirst({
    where: {
      email: { equals: normalized, mode: "insensitive" },
      isDeleted: false,
    },
  });
  if (!user) return;
  const token = randomUUID();
  await setPasswordResetToken(token, user.id);
  const link = buildResetLink(token);
  await sendEmail(user.email, link);
}

/** Public: reset password using token from email. */
export async function resetPassword(body: ResetPasswordBody): Promise<void> {
  const userId = await getPasswordResetToken(body.token);
  if (!userId) throw unauthorized("Invalid or expired reset link");
  const passwordHash = await bcrypt.hash(body.newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
  await deletePasswordResetToken(body.token);
}
