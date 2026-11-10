import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { buildPasswordResetEmail } from "./passwordResetEmailTemplate.js";
import { buildGradeAccessEmail } from "./gradeAccessEmailTemplate.js";

/** Whether SMTP is configured (all required vars set). */
export function isSmtpConfigured(): boolean {
  return !!(env.SMTP_HOST && env.SMTP_PORT != null && env.SMTP_USER && env.SMTP_PASS && env.SMTP_FROM);
}

let pooled: nodemailer.Transporter | null = null;

/**
 * One shared transport that keeps its SMTP connection open and is rate limited (at most 1 message a second on 1 connection),
 * instead of logging in again for every email: many logins in a minute is what gets a mailbox flagged. Both emails below use it.
 */
function transport(): nodemailer.Transporter {
  if (!pooled) {
    pooled = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT!,
      secure: env.SMTP_SECURE ?? false,
      auth: { user: env.SMTP_USER!, pass: env.SMTP_PASS! },
      pool: true,
      maxConnections: 1,
      maxMessages: 100,
      rateDelta: 1000,
      rateLimit: 1,
    });
  }
  return pooled;
}

/** Reserved example domains (RFC 2606) can never be delivered, so they are logged instead of sent (keeps test data off the mail server). */
function isReservedExampleAddress(email: string): boolean {
  const domain = email.split("@").pop()?.toLowerCase() ?? "";
  return /^example\.(com|net|org)$/.test(domain) || /\.(invalid|test|example|localhost)$/.test(domain);
}

export async function sendGradeAccessEmail(params: {
  toEmail: string;
  subjectName: string;
  studentName: string;
  studentNumber: string;
  accessCode: string;
  lookupUrl: string;
}): Promise<void> {
  if (isSmtpConfigured() && !isReservedExampleAddress(params.toEmail)) {
    const { subject, text, html } = buildGradeAccessEmail({
      subjectName: params.subjectName,
      studentName: params.studentName,
      studentNumber: params.studentNumber,
      accessCode: params.accessCode,
      lookupUrl: params.lookupUrl,
    });
    await transport().sendMail({
      from: env.SMTP_FROM!,
      to: params.toEmail,
      subject,
      text,
      html,
    });
  } else {
    console.log(
      "[Grade access] No SMTP configured.",
      params.toEmail,
      params.studentNumber,
      params.accessCode,
      params.lookupUrl
    );
  }
}

/** Send password reset email. If SMTP is not configured, logs the link to console (for dev). */
export async function sendPasswordResetEmail(toEmail: string, resetLink: string): Promise<void> {
  if (isSmtpConfigured()) {
    const { subject, text, html } = buildPasswordResetEmail(resetLink);
    await transport().sendMail({
      from: env.SMTP_FROM!,
      to: toEmail,
      subject,
      text,
      html,
    });
  } else {
    // Dev fallback: log the link so we can copy it
    console.log("[Password reset] No SMTP configured. Reset link for", toEmail, ":", resetLink);
  }
}
