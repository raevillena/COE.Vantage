export function buildGradeAccessEmail(params: {
  subjectName: string;
  studentName: string;
  studentNumber: string;
  accessCode: string;
  lookupUrl: string;
}): { subject: string; text: string; html: string } {
  const { studentName, studentNumber, accessCode, lookupUrl } = params;
  const e = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const subject = "Your grade access code";
  const text = [
    `Hello ${studentName},`,
    "",
    "Your grade access details (one code shows all your subjects that were made visible):",
    `Student Number: ${studentNumber}`,
    `Access Code: ${accessCode}`,
    "",
    `Open this link: ${lookupUrl}`,
    "",
    "If you did not expect this message, please ignore it.",
  ].join("\n");

  const html = `
    <p>Hello ${e(studentName)},</p>
    <p>Your grade access details (one code shows all your subjects that were made visible):</p>
    <ul>
      <li><strong>Student Number:</strong> ${e(studentNumber)}</li>
      <li><strong>Access Code:</strong> ${e(accessCode)}</li>
    </ul>
    <p>
      <a href="${e(lookupUrl)}">Open grade lookup page</a>
    </p>
    <p>If you did not expect this message, please ignore it.</p>
  `;

  return { subject, text, html };
}

