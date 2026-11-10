import { test, expect } from "@playwright/test";
import { API, PASSWORD, login } from "./support";

const COE = "00000000-0000-0000-0000-0000000000a2";

test.describe("pagination", () => {
  test("subjects are paged by the server and search reaches every page; student classes are paged in the browser", async ({ page, request }) => {
    test.setTimeout(240_000);
    page.setDefaultTimeout(10_000);
    const auth = await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } });
    const login1 = (await auth.json()) as { accessToken: string; user: { id: string } };
    const headers = { Authorization: `Bearer ${login1.accessToken}`, "X-College-Id": COE };
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [`cv_view_college_${login1.user.id}`, COE]);

    const curriculumIds: string[] = [];
    const subjectIds: string[] = [];
    const classIds: string[] = [];
    try {
      const cur = (await (await request.post(`${API}/curriculum`, { headers, data: { name: "QA Paging Curriculum" } })).json()) as { id: string };
      curriculumIds.push(cur.id);
      // 60 subjects and 60 classes, with codes/names that sort in a known order
      for (let i = 1; i <= 60; i++) {
        const n = String(i).padStart(3, "0");
        const r = await request.post(`${API}/subjects`, { headers, data: { code: `QAP ${n}`, name: `QA Paging Subject ${n}`, lecUnits: 3, labUnits: 0, curriculumId: cur.id, yearLevel: 1 + (i % 4) } });
        expect(r.status(), await r.text()).toBe(201);
        subjectIds.push(((await r.json()) as { id: string }).id);
        const c = await request.post(`${API}/student-classes`, { headers, data: { name: `QA Paging Class ${n}`, yearLevel: 1 + (i % 4), curriculumId: cur.id, studentCount: 20 } });
        expect(c.status(), await c.text()).toBe(201);
        classIds.push(((await c.json()) as { id: string }).id);
      }

      // ---- the API: one page, and a search that is not limited to it
      const paged = async (params: Record<string, string | number>) =>
        (await (await request.get(`${API}/subjects`, { headers, params: { curriculumId: cur.id, ...params } })).json()) as { items: { code: string }[]; total: number; totalAll: number; page: number; pageSize: number };
      const first = await paged({ page: 1, pageSize: 25 });
      expect(first.items.map((s) => s.code)).toEqual(Array.from({ length: 25 }, (_, i) => `QAP ${String(i + 1).padStart(3, "0")}`));
      expect(first.total).toBe(60);
      expect(first.totalAll).toBeGreaterThanOrEqual(60);
      const third = await paged({ page: 3, pageSize: 25 });
      expect(third.items).toHaveLength(10);
      const found = await paged({ page: 1, pageSize: 25, q: "paging subject 058" });
      expect(found.items.map((s) => s.code)).toEqual(["QAP 058"]); // row 58 is on page 3, the search still finds it
      expect((await paged({ page: 99, pageSize: 25 })).page).toBe(3); // a page past the end is clamped
      const year2 = await paged({ page: 1, pageSize: 100, yearLevel: "2" });
      expect(year2.total).toBe(15); // filters count all the rows too
      expect((await request.get(`${API}/subjects`, { headers, params: { page: 0 } })).status()).toBe(400);
      // without ?page= the plain list (pickers, scheduler) is still an array
      expect(Array.isArray(await (await request.get(`${API}/subjects`, { headers })).json())).toBe(true);

      await login(page, "admin@coe.vantage");

      // ---- Subjects page
      await page.goto("/subjects");
      const pager = page.getByTestId("pager");
      await expect(pager.getByText(/^1–50 of 60$/)).toBeVisible();
      await expect(page.locator("tbody tr")).toHaveCount(50);
      await pager.getByRole("button", { name: "Next" }).click();
      await expect(pager.getByText(/^51–60 of 60$/)).toBeVisible();
      await expect(page.locator("tbody tr")).toHaveCount(10);
      // a search typed on page 2 covers every page and goes back to page 1
      await page.getByLabel("Search subjects").fill("QAP 007");
      await expect(page.getByRole("cell", { name: "QAP 007", exact: true })).toBeVisible();
      await expect(page.locator("tbody tr")).toHaveCount(1);
      await page.getByRole("button", { name: "Clear filters" }).click();
      await expect(pager.getByText(/^1–50 of 60$/)).toBeVisible();
      // a smaller page size
      await pager.getByLabel("Rows per page").selectOption("25");
      await expect(pager.getByText(/^1–25 of 60$/)).toBeVisible();
      await expect(page.locator("tbody tr")).toHaveCount(25);

      // ---- Student classes page (the list is loaded whole; search and paging work on all of it)
      await page.goto("/student-classes");
      await page.getByLabel("Search student classes").fill("QA Paging Class");
      await expect(page.getByText("Showing 60 of")).toBeVisible();
      await expect(page.locator("tbody tr")).toHaveCount(50);
      await page.getByTestId("pager").getByRole("button", { name: "Next" }).click();
      await expect(page.locator("tbody tr")).toHaveCount(10);
      await page.getByLabel("Search student classes").fill("QA Paging Class 059");
      await expect(page.locator("tbody tr")).toHaveCount(1);
    } finally {
      for (const id of classIds) {
        await request.delete(`${API}/student-classes/${id}`, { headers });
        await request.delete(`${API}/student-classes/trash/${id}`, { headers });
      }
      for (const id of subjectIds) {
        await request.delete(`${API}/subjects/${id}`, { headers });
        await request.delete(`${API}/subjects/trash/${id}`, { headers });
      }
      for (const id of curriculumIds) {
        await request.delete(`${API}/curriculum/${id}`, { headers });
        await request.delete(`${API}/curriculum/trash/${id}`, { headers });
      }
    }
  });
});
