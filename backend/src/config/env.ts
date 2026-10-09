import dotenv from "dotenv";

// Load .env from backend root; then .env.local so local overrides (e.g. for dev).
dotenv.config();
dotenv.config({ path: ".env.local", override: true });

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("4000").transform(Number),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_ACCESS_SECRET: z.string().min(1, "JWT_ACCESS_SECRET is required"),
  JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),
  ACCESS_TOKEN_EXPIRY: z.string().default("15m"),
  REFRESH_TOKEN_EXPIRY: z.string().default("7d"),
  FRONTEND_ORIGIN: z.string().default("http://localhost:5173"),
  /**
   * When true, Express honors `X-Forwarded-For` for `req.ip` (needed for correct per-IP rate limits behind nginx).
   * Set in production behind a reverse proxy; leave false in local dev unless you proxy through nginx locally.
   */
  TRUST_PROXY: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  /** Base URL for password reset links (e.g. https://app.example.com). Defaults to FRONTEND_ORIGIN. */
  RESET_PASSWORD_BASE_URL: z.string().optional(),
  /** Optional SMTP for sending password reset emails. If not set, reset link is logged to console (dev). */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional().transform((v) => (v ? Number(v) : undefined)),
  SMTP_SECURE: z.string().optional().transform((v) => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration");
  }
  return parsed.data;
}

export const env = loadEnv();
