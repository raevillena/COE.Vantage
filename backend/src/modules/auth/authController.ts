import type { Request, Response } from "express";
import { login as loginService, refresh as refreshService, logout as logoutService, register as registerService } from "./authService.js";
import type { LoginBody, RegisterBody } from "./authSchemas.js";

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
