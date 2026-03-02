import type { Request, Response } from "express";
import {
  login as loginService,
  refresh as refreshService,
  logout as logoutService,
  register as registerService,
  requestPasswordReset as requestPasswordResetService,
  sendPasswordResetEmailForUser as sendPasswordResetEmailService,
  resetPassword as resetPasswordService,
} from "./authService.js";
import type {
  LoginBody,
  RegisterBody,
  RequestPasswordResetBody,
  SendPasswordResetEmailBody,
  ResetPasswordBody,
} from "./authSchemas.js";

const REFRESH_COOKIE_NAME = "refreshToken";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: "/",
};

export async function login(req: Request, res: Response): Promise<void> {
  const body = req.body as LoginBody;
  const result = await loginService(body);
  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, COOKIE_OPTIONS);
  res.json({ accessToken: result.accessToken, user: result.user });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!token) {
    res.status(401).json({ message: "Refresh token required" });
    return;
  }
  const result = await refreshService(token);
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

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const body = req.body as ResetPasswordBody;
  await resetPasswordService(body);
  res.json({ message: "Password updated. You can log in with your new password." });
}
