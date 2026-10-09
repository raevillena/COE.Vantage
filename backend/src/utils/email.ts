import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { buildPasswordResetEmail } from "./passwordResetEmailTemplate.js";
import { buildGradeAccessEmail } from "./gradeAccessEmailTemplate.js";

/** Whether SMTP is configured (all required vars set). */
function isSmtpConfigured(): boolean {
  return !!(env.SMTP_HOST && env.SMTP_PORT != null && env.SMTP_USER && env.SMTP_PASS && env.SMTP_FROM);
}

export async function sendGradeAccessEmail(params: {
  toEmail: string;
  subjectName: string;
  studentName: string;
  studentNumber: string;
  accessCode: string;
  lookupUrl: string;
}): Promise<void> {
  if (isSmtpConfigured()) {
    const { subject, text, html } = buildGradeAccessEmail({
      subjectName: params.subjectName,
      studentName: params.studentName,
      studentNumber: params.studentNumber,
      accessCode: params.accessCode,
      lookupUrl: params.lookupUrl,
    });
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT!,
      secure: env.SMTP_SECURE ?? false,
      auth: { user: env.SMTP_USER!, pass: env.SMTP_PASS! },
    });
    await transporter.sendMail({
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
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT!,
      secure: env.SMTP_SECURE ?? false,
      auth: { user: env.SMTP_USER!, pass: env.SMTP_PASS! },
    });
    await transporter.sendMail({
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
