import { test, expect } from "@playwright/test";
import { API, PASSWORD, login } from "./support";

type Row = { id: string; email: string; emailDigest?: boolean; emailDeadlines?: boolean };

test.describe("admin email settings for users", () => {
  test("only the admin can change them, for several people at once, and the list shows them", async ({ request }) => {
    const token = async (email: string) =>
      ((await (await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } })).json()) as { accessToken: string }).accessToken;
    const admin = { Authorization: `Bearer ${await token("admin@coe.vantage")}` };
    const chair = { Authorization: `Bearer ${await token("chairman@coe.vantage")}` };

    const all = (await (await request.get(`${API}/users`, { headers: admin })).json()) as Row[];
    const pick = all.filter((u) => ["faculty1@coe.vantage", "faculty2@coe.vantage"].includes(u.email));
    expect(pick.length).toBe(2);
    const ids = pick.map((u) => u.id);
    try {
      // not for a chairman, and the chairman's list does not carry the switches
      expect((await request.patch(`${API}/users/email-preferences`, { headers: chair, data: { userIds: ids, digest: true } })).status()).toBe(403);
      const chairList = (await (await request.get(`${API}/users`, { headers: chair })).json()) as Row[];
      expect(chairList.every((u) => u.emailDigest === undefined)).toBe(true);
      // an empty request is refused
      expect((await request.patch(`${API}/users/email-preferences`, { headers: admin, data: { userIds: ids } })).status()).toBe(400);

      const set = await request.patch(`${API}/users/email-preferences`, { headers: admin, data: { userIds: ids, digest: true, deadlines: false } });
      expect(set.status()).toBe(200);
      expect(((await set.json()) as { updated: number }).updated).toBe(2);
      const after = ((await (await request.get(`${API}/users`, { headers: admin })).json()) as Row[]).filter((u) => ids.includes(u.id));
      expect(after.every((u) => u.emailDigest === true && u.emailDeadlines === false)).toBe(true);
    } finally {
      await request.patch(`${API}/users/email-preferences`, { headers: admin, data: { userIds: ids, digest: false, deadlines: true } });
    }
  });

  test("ticking people on the Users page and using the bulk menu turns their emails off", async ({ page, request }) => {
    const adminToken = ((await (await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } })).json()) as { accessToken: string }).accessToken;
    const admin = { Authorization: `Bearer ${adminToken}` };
    const all = (await (await request.get(`${API}/users`, { headers: admin })).json()) as Row[];
    const pick = all.filter((u) => ["faculty1@coe.vantage", "faculty2@coe.vantage"].includes(u.email));
    const ids = pick.map((u) => u.id);
    try {
      await request.patch(`${API}/users/email-preferences`, { headers: admin, data: { userIds: ids, digest: true, deadlines: true } });
      await login(page, "admin@coe.vantage");
      await page.goto("/users");
      await page.getByPlaceholder(/Search by name/).fill("faculty");
      for (const u of pick) await page.getByRole("row").filter({ hasText: u.email }).getByRole("checkbox").check();
      await expect(page.getByTestId("user-bulk-bar")).toContainText("2 selected");
      await page.getByRole("button", { name: "Email notifications" }).click();
      await page.getByRole("menuitem", { name: "Turn off all emails" }).click();
      await expect(page.getByText("Email settings updated for 2 people")).toBeVisible();
      for (const u of pick) await expect(page.getByRole("row").filter({ hasText: u.email })).toContainText("Digest offDeadlines off");
      const after = ((await (await request.get(`${API}/users`, { headers: admin })).json()) as Row[]).filter((u) => ids.includes(u.id));
      expect(after.every((u) => u.emailDigest === false && u.emailDeadlines === false)).toBe(true);
    } finally {
      await request.patch(`${API}/users/email-preferences`, { headers: admin, data: { userIds: ids, digest: false, deadlines: true } });
    }
  });
});
