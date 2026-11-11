const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type DigestItem = { title: string; body?: string | null; link?: string | null };

/** One email listing a person's unread notifications. Links open the app page the notification points to. */
export function buildDigestEmail(params: { name: string; items: DigestItem[]; origin: string }): { subject: string; text: string; html: string } {
  const { name, items, origin } = params;
  const subject = items.length === 1 ? "COE Vantage: 1 unread notification" : `COE Vantage: ${items.length} unread notifications`;
  const url = (link?: string | null) => `${origin}${link && link.startsWith("/") ? link : "/dashboard"}`;
  const text = [
    `Hello ${name},`,
    "",
    "You have unread notifications in COE Vantage:",
    "",
    ...items.map((i) => `- ${i.title}${i.body ? ` (${i.body})` : ""}\n  ${url(i.link)}`),
    "",
    `Open the app: ${origin}`,
    "You get at most one of these emails a day. You can turn them off on your Profile page.",
  ].join("\n");
  const html = `
    <p>Hello ${esc(name)},</p>
    <p>You have unread notifications in COE Vantage:</p>
    <ul>
      ${items.map((i) => `<li><a href="${esc(url(i.link))}">${esc(i.title)}</a>${i.body ? ` <span style="color:#666">${esc(i.body)}</span>` : ""}</li>`).join("\n      ")}
    </ul>
    <p><a href="${esc(origin)}">Open COE Vantage</a></p>
    <p style="color:#666;font-size:12px">You get at most one of these emails a day. You can turn them off on your Profile page.</p>
  `;
  return { subject, text, html };
}
