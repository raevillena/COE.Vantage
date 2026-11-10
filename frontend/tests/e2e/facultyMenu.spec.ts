import { test, expect } from "@playwright/test";
import { API, PASSWORD, login } from "./support";

// a group heading also holds the small college badge, so match its start
const heading = (title: string) => new RegExp(`^${title}`);

test.describe("faculty menu", () => {
  test("a faculty member's menu has Management and Schedules groups", async ({ page }) => {
    page.setDefaultTimeout(10_000);
    await login(page, "faculty1@coe.vantage");
    const nav = page.locator("aside nav").first();
    const group = (title: string) => nav.locator("div.space-y-1", { has: page.getByText(heading(title)) });

    await expect(nav.getByText(heading("Management"))).toBeVisible();
    await expect(nav.getByText(heading("Schedules"))).toBeVisible();
    // the old group names are gone for faculty
    await expect(nav.getByText(heading("Scheduling"))).toHaveCount(0);
    await expect(nav.locator("div.uppercase").filter({ hasText: heading("Reports") })).toHaveCount(0); // the group, not the link

    await expect(group("Management").getByRole("link", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(group("Management").getByRole("link", { name: "Exam Room Reservation", exact: true })).toBeVisible();
    for (const name of ["Reports", "Class schedule", "Room availability"]) {
      await expect(group("Schedules").getByRole("link", { name, exact: true }), name).toBeVisible();
    }
    // they are not in Management any more
    for (const name of ["Reports", "Class schedule", "Room availability"]) {
      await expect(group("Management").getByRole("link", { name, exact: true }), name).toHaveCount(0);
    }
  });

  test("other roles keep the Scheduling and Reports groups", async ({ page }) => {
    page.setDefaultTimeout(10_000);
    await login(page, "chairman@coe.vantage");
    const nav = page.locator("aside nav").first();
    await expect(nav.getByText(heading("Scheduling"))).toBeVisible();
    await expect(nav.getByRole("link", { name: "Scheduler", exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Exam Room Reservation", exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Class schedule", exact: true })).toBeVisible();
  });

  test("a faculty member's experiments sit in Management with an Experimental badge", async ({ page, request }) => {
    test.setTimeout(60_000);
    page.setDefaultTimeout(10_000);
    const signIn = async (email: string) => {
      const r = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
      const body = (await r.json()) as { accessToken: string; user: { id: string } };
      return { headers: { Authorization: `Bearer ${body.accessToken}` }, id: body.user.id };
    };
    const admin = await signIn("admin@coe.vantage");
    const faculty = await signIn("faculty1@coe.vantage");
    const grants = (await (await request.get(`${API}/users/${faculty.id}/experimental-features`, { headers: admin.headers })).json()) as { granted: string[] };
    const prefs = (await (await request.get(`${API}/auth/me/experimental-features`, { headers: faculty.headers })).json()) as { enabled: boolean; features: string[] };
    try {
      await request.put(`${API}/users/${faculty.id}/experimental-features`, { headers: admin.headers, data: { granted: ["gradeModule", "mmsuGradePush"] } });
      await request.patch(`${API}/auth/me/experimental-features`, { headers: faculty.headers, data: { enabled: true, features: ["gradeModule", "mmsuGradePush"] } });
      await login(page, "faculty1@coe.vantage");
      const nav = page.locator("aside nav").first();
      const management = nav.locator("div.space-y-1", { has: page.getByText(heading("Management")) });
      for (const name of ["Grades", "Portal Insert Grade"]) {
        const link = management.getByRole("link", { name: new RegExp(`^${name}`) });
        await expect(link, name).toBeVisible();
        await expect(link.getByTitle("Experimental"), `${name} badge`).toBeVisible();
      }
      // no separate Experimental section any more
      await expect(nav.locator("div.uppercase").filter({ hasText: heading("Experimental") })).toHaveCount(0);
    } finally {
      await request.patch(`${API}/auth/me/experimental-features`, { headers: faculty.headers, data: { enabled: prefs.enabled, features: prefs.features } });
      await request.put(`${API}/users/${faculty.id}/experimental-features`, { headers: admin.headers, data: { granted: grants.granted } });
    }
  });
});
