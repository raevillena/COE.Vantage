import { test, expect } from "@playwright/test";
import { API, PASSWORD, login } from "./support";

const COE = "00000000-0000-0000-0000-0000000000a2";

test("the curriculum build pool is grouped by curriculum, can be searched and filtered, and hides codes already in the curriculum", async ({ page, request }) => {
  test.setTimeout(90_000);
  const token = ((await (await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } })).json()) as { accessToken: string }).accessToken;
  const headers = { Authorization: `Bearer ${token}`, "X-College-Id": COE };
  const stamp = Date.now();
  const tag = `QP${stamp % 100000}`;
  type Named = { id: string };
  const post = async <T,>(path: string, data: object) => {
    const r = await request.post(`${API}${path}`, { headers, data });
    expect(r.status(), `${path} ${await r.text()}`).toBe(201);
    return (await r.json()) as T;
  };
  const departments = (await (await request.get(`${API}/departments`, { headers })).json()) as Named[];
  test.skip(departments.length === 0, "needs a department");
  const made = { curricula: [] as string[], subjects: [] as string[] };
  try {
    const here = (await post<Named>("/curriculum", { name: `QA Pool Here ${stamp}`, departmentId: departments[0].id })).id;
    const other = (await post<Named>("/curriculum", { name: `QA Pool Other ${stamp}`, departmentId: departments[0].id })).id;
    made.curricula.push(here, other);
    const subject = async (code: string, name: string, curriculumId: string | null, grouped = false) => {
      const s = await post<Named>("/subjects", { code, name, lecUnits: 3, collegeId: COE, ...(curriculumId ? { curriculumId } : {}), ...(grouped ? { yearLevel: 1, semester: 1 } : {}) });
      made.subjects.push(s.id);
    };
    await subject(`${tag}A`, "QA pool shared code", here); // already in this curriculum ...
    await subject(`${tag}A`, "QA pool shared code", other); // ... and the same code in another one
    await subject(`${tag}B`, "QA pool only in other", other, true); // placed in Year 1, 1st Sem there
    await subject(`${tag}C`, "QA pool by hand", null); // added by hand: no curriculum

    await login(page, "admin@coe.vantage");
    await page.goto(`/curriculum/${here}/build`);
    const pool = page.getByTestId("pool-filters");
    await expect(pool).toBeVisible();
    await page.getByLabel("Search the subject pool").fill(tag);

    const groups = page.getByTestId("pool-group");
    await expect(groups.filter({ hasText: `QA Pool Other ${stamp}` })).toContainText(`${tag}B`);
    await expect(groups.filter({ hasText: "No curriculum" })).toContainText(`${tag}C`);
    // the copy of a code that is already here is hidden...
    await expect(groups.filter({ hasText: `QA Pool Other ${stamp}` })).not.toContainText(`${tag}A`);
    // ...until the switch is turned off
    await page.getByLabel(/Hide codes already in this curriculum/).uncheck();
    await expect(groups.filter({ hasText: `QA Pool Other ${stamp}` })).toContainText(`${tag}A`);

    // icons: a check when it belongs to a curriculum, a stack when the same code is in several, a dashed circle when it is ungrouped there
    const row = (code: string) => page.locator("[data-testid=pool-group] div.cursor-grab", { hasText: code }).first();
    await expect(row(`${tag}B`).getByTestId("pool-has-curriculum")).toBeVisible();
    await expect(row(`${tag}B`).getByTestId("pool-in-many")).toHaveCount(0);
    await expect(row(`${tag}B`).getByTestId("pool-ungrouped")).toHaveCount(0); // it has a year and semester
    await expect(row(`${tag}A`).getByTestId("pool-has-curriculum")).toBeVisible();
    await expect(row(`${tag}A`).getByTestId("pool-in-many")).toHaveAttribute("title", /in 2 curricula/);
    await expect(row(`${tag}A`).getByTestId("pool-ungrouped")).toBeVisible();
    await expect(row(`${tag}C`).getByTestId("pool-has-curriculum")).toHaveCount(0); // added by hand
    await expect(row(`${tag}C`).getByTestId("pool-in-many")).toHaveCount(0);

    // one curriculum only
    await page.getByLabel("Filter the subject pool by curriculum").selectOption({ label: `QA Pool Other ${stamp}` });
    await expect(groups).toHaveCount(1);
    await expect(page.getByText(`${tag}C`)).toHaveCount(0);
  } finally {
    for (const id of made.subjects) {
      await request.delete(`${API}/subjects/${id}`, { headers });
      await request.delete(`${API}/subjects/trash/${id}`, { headers });
    }
    for (const id of made.curricula) {
      await request.delete(`${API}/curriculum/${id}`, { headers });
      await request.delete(`${API}/curriculum/trash/${id}`, { headers });
    }
  }
});
