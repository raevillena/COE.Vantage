import { test, expect } from "@playwright/test";
import { API, PASSWORD, login } from "./support";

test("the Requests page opens on the scheduling semester, can switch semester, and has a History button for the dean/admin", async ({ page, request }) => {
  const token = ((await (await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } })).json()) as { accessToken: string }).accessToken;
  const years = (await (await request.get(`${API}/academic-years`, { headers: { Authorization: `Bearer ${token}` } })).json()) as { id: string; isActive: boolean; currentSemester?: number }[];
  const active = years.find((y) => y.isActive) ?? years[0];
  const sem = active.currentSemester === 2 ? 2 : 1;

  await login(page, "admin@coe.vantage");
  const first = page.waitForResponse((r) => r.url().includes("/assignment-requests?") && r.url().includes(`semester=${sem}`) && r.url().includes(`academicYearId=${active.id}`));
  await page.goto("/requests");
  await first;
  await expect(page.locator("#req-year")).toHaveValue(active.id);
  await expect(page.locator("#req-sem")).toHaveValue(String(sem));
  await expect(page.getByRole("button", { name: "History" })).toBeVisible();

  const other = sem === 1 ? 2 : 1;
  const second = page.waitForResponse((r) => r.url().includes("/assignment-requests?") && r.url().includes(`semester=${other}`));
  await page.locator("#req-sem").selectOption(String(other));
  await second;
});
