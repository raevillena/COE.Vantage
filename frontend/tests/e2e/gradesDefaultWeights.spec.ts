import { test, expect } from "@playwright/test";
import { API, PASSWORD, login } from "./support";

test.describe("default grading weights", () => {
  test("a subject with no formula starts from Major Exams 15 + 15 and Major Outputs 70", async ({ page, request }) => {
    test.setTimeout(120_000);
    const auth = await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } });
    const headers = { Authorization: `Bearer ${((await auth.json()) as { accessToken: string }).accessToken}` };
    const prefs = (await (await request.get(`${API}/auth/me/experimental-features`, { headers })).json()) as { enabled: boolean; features: string[] };
    const made: string[] = [];
    const subject = async (name: string, grades: Record<string, number>) => {
      const id = ((await (await request.post(`${API}/grade-subjects`, { headers, data: { name } })).json()) as { id: string }).id;
      made.push(id);
      const maxScores = Object.fromEntries(Object.keys(grades).map((k) => [k, 100]));
      const rec = await request.post(`${API}/grade-subjects/${id}/records`, { headers, data: { studentName: "DEFAULT, STUDENT", studentNumber: "99-883001", grades, maxScores } });
      expect(rec.status(), await rec.text()).toBe(201);
      return id;
    };
    const read = async (id: string) =>
      (await (await request.get(`${API}/grade-subjects/${id}`, { headers })).json()) as { gradingSystem: { categories: { name: string; weight: number; components: { name: string; weight: number; gradeKeys: string[] }[] }[] } | null };
    const openSettings = async (name: string) => {
      await page.goto("/experimental/grades");
      await page.getByRole("button", { name, exact: true }).click();
      await page.getByRole("button", { name: "Grading settings" }).click();
      return page.getByRole("dialog");
    };
    try {
      await request.patch(`${API}/auth/me/experimental-features`, { headers, data: { enabled: true, features: Array.from(new Set([...prefs.features, "gradeModule"])) } });
      // columns that fit the default components by name ("Midterm" fits "Midterms")
      const fits = await subject("QA Default Fits", { Midterm: 80, Finals: 90, "Major Outputs": 70 });
      // columns that fit nothing
      const nothing = await subject("QA Default Nothing", { "Quiz 1": 10, "Quiz 2": 12 });
      await login(page, "admin@coe.vantage");

      // ---- columns that fit: the structure, the weights and the columns are all filled in
      let dialog = await openSettings("QA Default Fits");
      await expect(dialog.getByText(/starts from the default weights: Major Exams \(Midterms 15 \+ Finals 15\) and Major Outputs \(70\)/)).toBeVisible();
      await expect(dialog.getByLabel("Major Exams total, the sum of its components")).toHaveValue("30");
      await expect(dialog.getByLabel("Major Outputs total, the sum of its components")).toHaveValue("70");
      const shares = dialog.getByLabel("% of final");
      await expect(shares).toHaveCount(3);
      await expect(shares.nth(0)).toHaveValue("15");
      await expect(shares.nth(1)).toHaveValue("15");
      await expect(shares.nth(2)).toHaveValue("70");
      await dialog.getByRole("button", { name: "Save formula" }).click();
      await expect
        .poll(async () => JSON.stringify(((await read(fits)).gradingSystem?.categories ?? []).map((c) => [c.name, c.weight, c.components.map((x) => [x.name, x.weight, x.gradeKeys])])))
        .toBe(JSON.stringify([["Major Exams", 30, [["Midterms", 15, ["Midterm"]], ["Finals", 15, ["Finals"]]]], ["Major Outputs", 70, [["Major Outputs", 70, ["Major Outputs"]]]]]));
      // 15% of 80 + 15% of 90 + 70% of 70 = 74.5
      expect((await request.post(`${API}/grade-subjects/${fits}/compute-grades`, { headers })).status()).toBeLessThan(300);
      const recs = (await (await request.get(`${API}/grade-subjects/${fits}/records`, { headers })).json()) as { computedGrade: { finalGrade: number } | null }[];
      expect(recs[0].computedGrade?.finalGrade).toBe(74.5);

      // ---- columns that fit nothing: the structure is there, a column must be picked before it can be saved
      await page.keyboard.press("Escape");
      dialog = await openSettings("QA Default Nothing");
      await expect(dialog.getByLabel("Major Exams total, the sum of its components")).toHaveValue("30");
      await dialog.getByRole("button", { name: "Save formula" }).click();
      await expect(dialog.getByText(/needs at least one grade key/).first()).toBeVisible();
      expect((await read(nothing)).gradingSystem).toBeNull(); // nothing was stored
    } finally {
      for (const id of made) await request.delete(`${API}/grade-subjects/${id}`, { headers });
      await request.patch(`${API}/auth/me/experimental-features`, { headers, data: { enabled: prefs.enabled, features: prefs.features } });
    }
  });
});
