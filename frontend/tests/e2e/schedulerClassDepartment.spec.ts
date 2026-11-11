import { test, expect } from "@playwright/test";
import { API, PASSWORD, login } from "./support";

test("scheduler: the admin narrows the Student class list by department", async ({ page, request }) => {
  const auth = await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } });
  const headers = { Authorization: `Bearer ${((await auth.json()) as { accessToken: string }).accessToken}` };
  const classes = (await (await request.get(`${API}/student-classes`, { headers })).json()) as { name: string; curriculum?: { department?: { id: string } } }[];
  const deps = new Set(classes.map((c) => c.curriculum?.department?.id).filter(Boolean));
  test.skip(deps.size < 2, "needs classes in two departments");
  await login(page, "admin@coe.vantage");
  await page.goto("/scheduler");
  await page.getByRole("combobox", { name: "View mode" }).waitFor();
  const options = async () => {
    await page.getByRole("combobox", { name: "Student class" }).click();
    const n = await page.getByRole("option").count();
    await page.keyboard.press("Escape");
    return n;
  };
  const all = await options();
  await page.getByRole("combobox", { name: "Class department" }).click();
  await page.getByRole("option").nth(1).click();
  const narrowed = await options();
  expect(narrowed).toBeLessThan(all);
  await page.getByRole("combobox", { name: "Class department" }).click();
  await page.getByRole("option", { name: "All departments" }).click();
  expect(await options()).toBe(all);
});
