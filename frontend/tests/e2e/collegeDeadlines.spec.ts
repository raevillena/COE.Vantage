import { test, expect } from "@playwright/test";
import { API, PASSWORD, login } from "./support";

test.describe("college deadlines", () => {
  test("the college secretary adds deadlines for everyone or for chosen roles; the college reads them; only the secretary edits", async ({ page, request }) => {
    test.setTimeout(120_000);
    const token = async (email: string) => ((await (await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } })).json()) as { accessToken: string }).accessToken;
    const sec = { Authorization: `Bearer ${await token("secretary@coe.vantage")}` };
    const fac = { Authorization: `Bearer ${await token("faculty1@coe.vantage")}` };
    const chair = { Authorization: `Bearer ${await token("chairman@coe.vantage")}` };
    const made: string[] = [];
    const due = new Date(Date.now() + 9 * 86_400_000).toISOString();
    const titles = async (h: Record<string, string>) => ((await (await request.get(`${API}/college-deadlines`, { headers: h })).json()) as { title: string }[]).map((d) => d.title);
    try {
      // the secretary adds one for everyone and one for faculty only; defaults are 7, 3, 1 days before at 8 AM
      const all = await request.post(`${API}/college-deadlines`, { headers: sec, data: { title: "QA Submit teaching loads", dueAt: due } });
      expect(all.status(), await all.text()).toBe(201);
      const allBody = (await all.json()) as { id: string; reminderDays: number[]; reminderHour: number; audienceRoles: string[] };
      made.push(allBody.id);
      expect(allBody.reminderDays).toEqual([7, 3, 1]);
      expect(allBody.reminderHour).toBe(8);
      expect(allBody.audienceRoles).toEqual([]);
      const facOnly = await request.post(`${API}/college-deadlines`, { headers: sec, data: { title: "QA Faculty only: upload syllabi", dueAt: due, audienceRoles: ["FACULTY"], reminderDays: [2, 0], reminderHour: 9 } });
      expect(facOnly.status(), await facOnly.text()).toBe(201);
      const facBody = (await facOnly.json()) as { id: string; reminderDays: number[]; reminderHour: number };
      made.push(facBody.id);
      expect(facBody.reminderDays).toEqual([2, 0]);
      expect(facBody.reminderHour).toBe(9);

      // everyone in the college reads the general one; the faculty-only one is hidden from the chairman
      expect(await titles(fac)).toEqual(expect.arrayContaining(["QA Submit teaching loads", "QA Faculty only: upload syllabi"]));
      const chairTitles = await titles(chair);
      expect(chairTitles).toContain("QA Submit teaching loads");
      expect(chairTitles).not.toContain("QA Faculty only: upload syllabi");
      expect(await titles(sec)).toEqual(expect.arrayContaining(["QA Submit teaching loads", "QA Faculty only: upload syllabi"]));

      // only the secretary changes them
      expect((await request.post(`${API}/college-deadlines`, { headers: fac, data: { title: "QA nope", dueAt: due } })).status()).toBe(403);
      expect((await request.post(`${API}/college-deadlines`, { headers: chair, data: { title: "QA nope", dueAt: due } })).status()).toBe(403);
      expect((await request.patch(`${API}/college-deadlines/${allBody.id}`, { headers: fac, data: { title: "QA hijack", dueAt: due } })).status()).toBe(403);
      expect((await request.delete(`${API}/college-deadlines/${allBody.id}`, { headers: fac })).status()).toBe(403);
      // bad input
      expect((await request.post(`${API}/college-deadlines`, { headers: sec, data: { title: "", dueAt: due } })).status()).toBe(400);
      expect((await request.post(`${API}/college-deadlines`, { headers: sec, data: { title: "QA old", dueAt: new Date(Date.now() - 5 * 86_400_000).toISOString() } })).status()).toBe(400);

      // moving the due date starts the reminders over and tells the college
      const moved = await request.patch(`${API}/college-deadlines/${allBody.id}`, { headers: sec, data: { title: "QA Submit teaching loads", dueAt: new Date(Date.now() + 12 * 86_400_000).toISOString() } });
      expect(moved.status(), await moved.text()).toBe(200);

      // the faculty member sees them on the page, without edit controls; the secretary has them
      await login(page, "faculty1@coe.vantage");
      await page.goto("/deadlines");
      await expect(page.getByText("QA Submit teaching loads")).toBeVisible();
      await expect(page.getByText("QA Faculty only: upload syllabi")).toBeVisible();
      await expect(page.getByRole("button", { name: "Add deadline" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Edit QA/ })).toHaveCount(0);
      await page.context().clearCookies();
      await page.evaluate(() => sessionStorage.clear());

      await login(page, "secretary@coe.vantage");
      await page.goto("/deadlines");
      await page.getByRole("button", { name: "Add deadline" }).click();
      const dialog = page.getByRole("dialog");
      // the defaults are ticked: 7, 3 and 1 day before, at 8:00 AM
      await expect(dialog.getByRole("checkbox", { name: "7 days before" })).toBeChecked();
      await expect(dialog.getByRole("checkbox", { name: "3 days before" })).toBeChecked();
      await expect(dialog.getByRole("checkbox", { name: "1 day before" })).toBeChecked();
      await expect(dialog.getByRole("checkbox", { name: "14 days before" })).not.toBeChecked();
      await expect(dialog.getByLabel("Send at")).toHaveValue("8");
      await dialog.getByLabel("Title").fill("QA Page-made deadline");
      await dialog.getByLabel("Due date and time").fill(new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 16));
      await dialog.getByRole("checkbox", { name: "14 days before" }).check();
      await dialog.getByRole("button", { name: "Add deadline" }).click();
      await expect(page.getByText("QA Page-made deadline")).toBeVisible();
      const listed = (await (await request.get(`${API}/college-deadlines`, { headers: sec })).json()) as { id: string; title: string; reminderDays: number[] }[];
      const fromPage = listed.find((d) => d.title === "QA Page-made deadline")!;
      made.push(fromPage.id);
      expect(fromPage.reminderDays).toEqual([14, 7, 3, 1]);

      // removing asks first
      await page.getByRole("button", { name: "Remove QA Page-made deadline" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Remove", exact: true }).click();
      await expect(page.getByText("QA Page-made deadline")).toHaveCount(0);
    } finally {
      for (const id of made) await request.delete(`${API}/college-deadlines/${id}`, { headers: sec });
    }
  });
});
