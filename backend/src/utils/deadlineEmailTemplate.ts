const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type DeadlineMailItem = { title: string; description?: string | null; dueAt: Date; daysLeft: number };

const when = (d: Date) => d.toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "full", timeStyle: "short" });
const left = (n: number) => (n <= 0 ? "due today" : n === 1 ? "due tomorrow" : `due in ${n} days`);

/** One reminder email listing every deadline that is due for a reminder today for this person. */
export function buildDeadlineEmail(params: { name: string; items: DeadlineMailItem[]; origin: string }): { subject: string; text: string; html: string } {
  const { name, items, origin } = params;
  const first = items[0];
  const subject = items.length === 1 ? `Deadline ${left(first.daysLeft)}: ${first.title}` : `${items.length} deadlines coming up`;
  const link = `${origin}/deadlines`;
  const text = [
    `Hello ${name},`,
    "",
    items.length === 1 ? "A college deadline is coming up:" : "These college deadlines are coming up:",
    "",
    ...items.map((i) => `- ${i.title} (${left(i.daysLeft)}, ${when(i.dueAt)})${i.description ? `\n  ${i.description}` : ""}`),
    "",
    `See all deadlines: ${link}`,
    "You can turn these emails off on your Profile page (Email notifications).",
  ].join("\n");
  const html = `
    <p>Hello ${esc(name)},</p>
    <p>${items.length === 1 ? "A college deadline is coming up:" : "These college deadlines are coming up:"}</p>
    <ul>
      ${items
        .map(
          (i) =>
            `<li><strong>${esc(i.title)}</strong> <span style="color:#666">(${esc(left(i.daysLeft))}, ${esc(when(i.dueAt))})</span>${
              i.description ? `<br>${esc(i.description)}` : ""
            }</li>`
        )
        .join("\n      ")}
    </ul>
    <p><a href="${esc(link)}">See all deadlines</a></p>
    <p style="color:#666;font-size:12px">You can turn these emails off on your Profile page (Email notifications).</p>
  `;
  return { subject, text, html };
}
