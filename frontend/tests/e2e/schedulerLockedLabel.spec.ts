import { test, expect } from "@playwright/test";
import { API, PASSWORD, CE_CLASS, ensureCeClass, removeCeClass, login } from "./support";

const COE = "00000000-0000-0000-0000-0000000000a2";

test("a locked semester shows Locked beside 'Scheduling <class>' and on the Class schedule label", async ({ page, request }) => {
  test.setTimeout(90_000);
  const token = ((await (await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } })).json()) as { accessToken: string }).accessToken;
  const headers = { Authorization: `Bearer ${token}`, "X-College-Id": COE };
  const years = (await (await request.get(`${API}/academic-years`, { headers })).json()) as { id: string; isActive: boolean; currentSemester?: number; termLocks?: { semester: number }[] }[];
  const year = years.find((y) => y.isActive) ?? years[0];
  const semester = year.currentSemester === 2 ? 2 : 1;
  test.skip(year.termLocks?.some((l) => l.semester === semester), "the semester is already locked");
  await ensureCeClass(request);
  const setLock = (locked: boolean) => request.put(`${API}/academic-years/${year.id}/term-lock`, { headers, data: { semester, locked, collegeId: COE } });
  try {
    await login(page, "chairman@coe.vantage");
    await page.goto("/scheduler");
    await page.getByText("Select class").first().click();
    await page.getByRole("option", { name: CE_CLASS }).click();
    await expect(page.getByRole("heading", { name: /^Class schedule/ })).toBeVisible();
    await expect(page.getByTestId("scheduling-locked")).toHaveCount(0);

    expect((await setLock(true)).status()).toBe(200);
    await page.reload();
    await page.getByText("Select class").first().click();
    await page.getByRole("option", { name: CE_CLASS }).click();
    await expect(page.getByTestId("scheduling-locked")).toBeVisible();
    await expect(page.getByTestId("schedule-locked")).toBeVisible();
    // the dropdowns carry the lock too: the semester, and the selected class
    await expect(page.getByRole("combobox", { name: "Scheduling Semester" })).toContainText("🔒");
    await expect(page.getByRole("combobox", { name: "Student class" })).toContainText("🔒");
  } finally {
    await setLock(false);
    await removeCeClass(request);
  }
});
