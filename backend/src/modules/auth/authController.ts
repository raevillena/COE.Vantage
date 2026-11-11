import type { Request, Response } from "express";
import {
  login as loginService,
  sessionIdOf,
  getMyEmailDigest as getMyEmailDigestService,
  getMyEmailPreferences as getMyEmailPreferencesService,
  setMyEmailPreferences as setMyEmailPreferencesService,
  setMyEmailDigest as setMyEmailDigestService,
  googleSignInConfig,
  loginWithGoogle,
  refresh as refreshService,
  logout as logoutService,
  register as registerService,
  requestPasswordReset as requestPasswordResetService,
  sendPasswordResetEmailForUser as sendPasswordResetEmailService,
  requestPasswordResetByEmail as forgotPasswordService,
  resetPassword as resetPasswordService,
  getMyExperimentalFeatures as getMyExperimentalFeaturesService,
  updateMyExperimentalFeatures as updateMyExperimentalFeaturesService,
} from "./authService.js";
import {
  endOtherSessions,
  endSession,
  listSessions,
  myLoginHistory,
  recentLoginEvents,
  type ClientMeta,
} from "./loginSecurity.js";
import type {
  GoogleLoginBody,
  LoginBody,
  RegisterBody,
  RequestPasswordResetBody,
  SendPasswordResetEmailBody,
  ResetPasswordBody,
  UpdateExperimentalFeaturesBody,
} from "./authSchemas.js";

const REFRESH_COOKIE_NAME = "refreshToken";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: "/",
};

const clientMeta = (req: Request): ClientMeta => ({ ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null });

export async function mySessions(req: Request, res: Response): Promise<void> {
  res.json(await listSessions(req.user!.id, sessionIdOf(req.cookies?.[REFRESH_COOKIE_NAME])));
}

export async function endMySession(req: Request, res: Response): Promise<void> {
  await endSession(req.params.id, req.user!.id);
  res.json({ message: "Signed out" });
}

export async function endOtherSessionsOfMe(req: Request, res: Response): Promise<void> {
  res.json({ ended: await endOtherSessions(req.user!.id, sessionIdOf(req.cookies?.[REFRESH_COOKIE_NAME])) });
}

export async function myLoginHistoryList(req: Request, res: Response): Promise<void> {
  res.json(await myLoginHistory(req.user!.id));
}

export async function loginEventsForAdmin(req: Request, res: Response): Promise<void> {
  res.json(await recentLoginEvents(Number(req.query.limit ?? 100), req.query.failures === "1"));
}

export async function login(req: Request, res: Response): Promise<void> {
  const body = req.body as LoginBody;
  const result = await loginService(body, clientMeta(req));
  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, COOKIE_OPTIONS);
  res.json({ accessToken: result.accessToken, user: result.user });
}

export async function getEmailPreferences(req: Request, res: Response): Promise<void> {
  res.json(await getMyEmailPreferencesService(req.user!.id));
}

export async function setEmailPreferences(req: Request, res: Response): Promise<void> {
  res.json(await setMyEmailPreferencesService(req.user!.id, req.body as { digest?: boolean; deadlines?: boolean }));
}

export async function getEmailDigest(req: Request, res: Response): Promise<void> {
  res.json(await getMyEmailDigestService(req.user!.id));
}

export async function setEmailDigest(req: Request, res: Response): Promise<void> {
  res.json(await setMyEmailDigestService(req.user!.id, (req.body as { enabled: boolean }).enabled));
}

export async function googleConfig(_req: Request, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  res.json(googleSignInConfig());
}

export async function googleLogin(req: Request, res: Response): Promise<void> {
  const result = await loginWithGoogle((req.body as GoogleLoginBody).credential, clientMeta(req));
  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, COOKIE_OPTIONS);
  res.json({ accessToken: result.accessToken, user: result.user });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!token) {
    res.status(401).json({ message: "Refresh token required" });
    return;
  }
  const result = await refreshService(token, clientMeta(req));
  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, COOKIE_OPTIONS);
  res.json({ accessToken: result.accessToken });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  await logoutService(token);
  res.clearCookie(REFRESH_COOKIE_NAME, { path: "/" });
  res.json({ message: "Logged out" });
}

export async function register(req: Request, res: Response): Promise<void> {
  const body = req.body as RegisterBody;
  const user = await registerService(body);
  res.status(201).json(user);
}

export async function requestPasswordReset(req: Request, res: Response): Promise<void> {
  const body = req.body as RequestPasswordResetBody;
  if (!req.user) return; // authenticate middleware ensures this
  await requestPasswordResetService(req.user.id, body);
  res.json({ message: "Password reset email sent. Check your inbox." });
}

export async function sendPasswordResetEmail(req: Request, res: Response): Promise<void> {
  const body = req.body as SendPasswordResetEmailBody;
  await sendPasswordResetEmailService(body.email);
  res.json({ message: "Password reset email sent to that address." });
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const body = req.body as SendPasswordResetEmailBody;
  await forgotPasswordService(body.email);
  res.json({
    message:
      "If an account exists for that email, a password reset link has been sent.",
  });
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const body = req.body as ResetPasswordBody;
  await resetPasswordService(body);
  res.json({ message: "Password updated. You can log in with your new password." });
}

export async function getMyExperimentalFeatures(req: Request, res: Response): Promise<void> {
  if (!req.user) return;
  const preferences = await getMyExperimentalFeaturesService(req.user.id);
  res.json(preferences);
}

export async function updateMyExperimentalFeatures(req: Request, res: Response): Promise<void> {
  if (!req.user) return;
  const body = req.body as UpdateExperimentalFeaturesBody;
  const preferences = await updateMyExperimentalFeaturesService(req.user.id, body);
  res.json(preferences);
}
