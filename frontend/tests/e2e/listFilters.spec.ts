import { test, expect, type Page } from "@playwright/test";
import { API, PASSWORD, login } from "./support";

const COE = "00000000-0000-0000-0000-0000000000a2";

/** The counts the filter bar reports and the rows really on screen. */
async function counts(page: Page) {
  // most pages say "Showing x of y"; the paged Subjects page says "x matching of y subjects"
  const text = (await page.getByText(/^(Showing \d+ of \d+|\d+ matching of \d+ subjects)$/).textContent()) ?? "";
  const m = /(\d+)(?: matching)? of (\d+)/.exec(text.replace("Showing ", ""))!;
  const shown = Number(m[1]);
  return { shown, total: Number(m[2]), rows: await page.locator("tbody tr").count() };
}

/** Tries every filter of a page: picks its second option, the count must stay consistent, and Clear filters restores. */
async function exercise(page: Page, path: string, filterLabels: string[]) {
  await page.goto(path);
  await expect(page.getByTestId("list-filters").or(page.getByText(/matching of \d+ subjects/)).first()).toBeVisible();
  await expect.poll(async () => (await counts(page)).rows).toBeGreaterThan(0);
  const before = await counts(page);
  expect(before.rows).toBe(Math.min(before.shown, 50)); // pages hold 50 rows
  let exercised = 0;
  for (const label of filterLabels) {
    const select = page.getByLabel(label, { exact: true });
    if ((await select.count()) === 0) continue; // a filter that does not apply to this data is not offered
    const options = await select.locator("option").evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value));
    const pick = options.find((v) => v !== "");
    if (!pick) continue;
    await select.selectOption(pick);
    // the Subjects page asks the server, so wait until the rows have caught up with the count
    await expect.poll(async () => { const c = await counts(page); return c.rows === Math.min(c.shown, 50) && !(await page.getByRole("status").filter({ hasText: "Loading" }).count()); }, { message: `${label}: rows match the count` }).toBe(true);
    const after = await counts(page);
    expect(after.shown, `${label}: shown`).toBeLessThanOrEqual(before.total);
    exercised++;
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect.poll(async () => (await counts(page)).shown, { message: `${label}: cleared` }).toBe(before.shown);
    await expect(select).toHaveValue("");
  }
  return exercised;
}

test.describe("list filters on the admin pages", () => {
  test("student classes, subjects, rooms, curricula and departments filter and clear", async ({ page, request }) => {
    test.setTimeout(150_000);
    page.setDefaultTimeout(10_000);
    const auth = await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } });
    const login1 = (await auth.json()) as { user: { id: string } };
    // the admin looks at one college at a time: the College of Engineering
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [`cv_view_college_${login1.user.id}`, COE]);
    await login(page, "admin@coe.vantage");

    const classes = await exercise(page, "/student-classes", ["Filter by department", "Filter by curriculum", "Filter by year level", "Filter by specialization"]);
    expect(classes, "at least one student class filter").toBeGreaterThan(0);

    const subjects = await exercise(page, "/subjects", ["Filter by department", "Filter by year level", "Filter by semester", "Filter by type"]);
    expect(subjects, "at least one subject filter").toBeGreaterThan(0);

    const rooms = await exercise(page, "/rooms", ["Filter by department", "Filter by type", "Filter by availability", "Filter by equipment"]);
    expect(rooms, "at least one room filter").toBeGreaterThan(0);

    await exercise(page, "/curriculum", ["Filter by department"]);
    await exercise(page, "/departments", ["Filter by college"]);
  });

  test("the trash can be searched and narrowed to one kind", async ({ page, request }) => {
    test.setTimeout(90_000);
    page.setDefaultTimeout(10_000);
    const auth = await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } });
    const login1 = (await auth.json()) as { accessToken: string; user: { id: string } };
    const headers = { Authorization: `Bearer ${login1.accessToken}`, "X-College-Id": COE };
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [`cv_view_college_${login1.user.id}`, COE]);
    const made: string[] = [];
    try {
      const curriculum = (await (await request.post(`${API}/curriculum`, { headers, data: { name: "QA Trash Curriculum" } })).json()) as { id: string };
      made.push(curriculum.id);
      const subject = (await (await request.post(`${API}/subjects`, { headers, data: { code: "QAT 100", name: "QA Trash Subject", lecUnits: 3, labUnits: 0, curriculumId: curriculum.id } })).json()) as { id: string };
      await request.delete(`${API}/subjects/${subject.id}`, { headers });
      await request.delete(`${API}/curriculum/${curriculum.id}`, { headers });

      await login(page, "admin@coe.vantage");
      await page.goto("/trash");
      const search = page.getByLabel("Search trash");
      await search.fill("QA Trash");
      await expect(page.getByText("QAT 100")).toBeVisible();
      await expect(page.getByRole("cell", { name: "QA Trash Curriculum", exact: true })).toBeVisible();
      const { shown, total } = await counts(page);
      expect(shown).toBeLessThanOrEqual(total);

      // only subjects
      await page.getByLabel("Show", { exact: true }).selectOption("subjects");
      await expect(page.getByText("QAT 100")).toBeVisible();
      await expect(page.getByRole("cell", { name: "QA Trash Curriculum", exact: true })).toHaveCount(0);

      await search.fill("zzzz-no-such-item");
      await expect(page.getByText("Nothing in the trash matches these filters.")).toBeVisible();
      await page.getByRole("button", { name: "Clear filters" }).first().click();
      await expect(search).toHaveValue("");
    } finally {
      await request.delete(`${API}/subjects/trash/${(await (await request.get(`${API}/subjects/trash`, { headers })).json() as { id: string; code: string }[]).find((s) => s.code === "QAT 100")?.id ?? "none"}`, { headers });
      for (const id of made) await request.delete(`${API}/curriculum/trash/${id}`, { headers });
    }
  });
});
