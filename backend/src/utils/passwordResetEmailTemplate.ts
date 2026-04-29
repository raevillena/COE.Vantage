/** Escape for HTML text nodes (e.g. visible URL fallback). */
function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escape for double-quoted HTML attributes (e.g. href). */
function escapeHtmlAttr(s: string): string {
  return escapeHtmlText(s).replace(/'/g, "&#39;");
}

const SUBJECT = "Reset your password - COE.Vantage";

/**
 * Professional password-reset email (table layout + inline styles for common clients).
 * Plain `text` is included for clients that do not render HTML.
 */
export function buildPasswordResetEmail(resetLink: string): { subject: string; text: string; html: string } {
  const safeHref = escapeHtmlAttr(resetLink);
  const safeVisibleUrl = escapeHtmlText(resetLink);

  const text = [
    "COE.Vantage - password reset",
    "",
    "We received a request to reset your password. Use the link below (valid for 1 hour):",
    "",
    resetLink,
    "",
    "If you did not request this, you can ignore this email. Your password will stay the same.",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtmlText(SUBJECT)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <!-- Preheader (hidden in many clients; improves inbox preview) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    Use this secure link to choose a new password. Link expires in 1 hour.
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f1f5f9;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
          <tr>
            <td style="padding:32px 32px 8px 32px;font-family:Segoe UI,system-ui,-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 4px 0;font-size:13px;font-weight:600;letter-spacing:0.02em;color:#64748b;text-transform:uppercase;">
                COE.Vantage
              </p>
              <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:700;color:#0f172a;">
                Reset your password
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 24px 32px;font-family:Segoe UI,system-ui,-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#334155;">
              <p style="margin:0 0 16px 0;">
                We received a request to reset the password for your account. Click the button below to choose a new password.
              </p>
              <p style="margin:0 0 24px 0;">
                <a href="${safeHref}" style="display:inline-block;padding:12px 22px;background-color:#1d4ed8;color:#ffffff !important;text-decoration:none;font-weight:600;font-size:14px;border-radius:8px;">
                  Reset password
                </a>
              </p>
              <p style="margin:0 0 8px 0;font-size:13px;color:#64748b;">
                This link expires in <strong style="color:#475569;">1 hour</strong>. If the button does not work, copy and paste this URL into your browser:
              </p>
              <p style="margin:0;word-break:break-all;font-size:12px;line-height:1.5;color:#64748b;font-family:Consolas,ui-monospace,SFMono-Regular,Menlo,Monaco,monospace;">
                ${safeVisibleUrl}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px 32px;font-family:Segoe UI,system-ui,-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#94a3b8;border-top:1px solid #f1f5f9;">
              <p style="margin:20px 0 0 0;">
                If you did not request a password reset, you can safely ignore this message, your password will not be changed.
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:24px 0 0 0;font-family:Segoe UI,system-ui,-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#94a3b8;text-align:center;">
          This is an automated message from COE.Vantage. Please do not reply to this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject: SUBJECT, text, html };
}
