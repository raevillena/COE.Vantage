import { test, expect } from "@playwright/test";
import { API, PASSWORD, login } from "./support";

test.describe("grade subject rename and formula copy", () => {
  test("a subject can be renamed, and a formula copied from another subject skips what does not match", async ({ page, request }) => {
    test.setTimeout(120_000);
    const auth = await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } });
    const headers = { Authorization: `Bearer ${((await auth.json()) as { accessToken: string }).accessToken}` };
    const prefs = (await (await request.get(`${API}/auth/me/experimental-features`, { headers })).json()) as { enabled: boolean; features: string[] };
    const made: string[] = [];
    const subject = async (name: string, columns: string[], gradingSystem?: object) => {
      const id = ((await (await request.post(`${API}/grade-subjects`, { headers, data: { name } })).json()) as { id: string }).id;
      made.push(id);
      const maxScores = Object.fromEntries(columns.map((c) => [c, 100]));
      const rec = await request.post(`${API}/grade-subjects/${id}/records`, {
        headers,
        data: { studentName: "COPY, STUDENT", studentNumber: "99-882001", grades: Object.fromEntries(columns.map((c) => [c, 80])), maxScores },
      });
      expect(rec.status(), await rec.text()).toBe(201);
      if (gradingSystem) {
        const patched = await request.patch(`${API}/grade-subjects/${id}`, { headers, data: { gradingSystem } });
        expect(patched.status(), await patched.text()).toBe(200);
      }
      return id;
    };
    const read = async (id: string) => (await (await request.get(`${API}/grade-subjects/${id}`, { headers })).json()) as { name: string; code: string | null; gradingSystem: { categories: { name: string; weight: number; components: { name: string; weight: number; gradeKeys: string[] }[] }[] } | null };
    try {
      await request.patch(`${API}/auth/me/experimental-features`, { headers, data: { enabled: true, features: Array.from(new Set([...prefs.features, "gradeModule"])) } });
      await subject("QA Copy Source", ["Q1", "Q2", "P1", "E1"], {
        categories: [
          { name: "Class work", weight: 40, components: [{ name: "Quizzes", weight: 20, gradeKeys: ["Q1", "Q2"] }, { name: "Project", weight: 20, gradeKeys: ["P1"] }] },
          { name: "Exams", weight: 60, components: [{ name: "Final", weight: 60, gradeKeys: ["E1"] }] },
        ],
      });
      // this subject has q1 and E1 only: Quizzes keeps q1 (matched ignoring case), Project matches nothing, Final matches
      const target = await subject("QA Copy Target", ["q1", "E1"]);

      await login(page, "admin@coe.vantage");
      await page.goto("/experimental/grades");

      // ---- rename
      await page.getByRole("button", { name: "Rename QA Copy Target" }).click();
      const renameDialog = page.getByRole("dialog");
      await renameDialog.getByLabel("Name").fill("QA Copy Target Renamed");
      await renameDialog.getByLabel("Code (optional)").fill("QCT 1");
      await renameDialog.getByRole("button", { name: "Save name" }).click();
      await expect(page.getByRole("button", { name: "QA Copy Target Renamed", exact: true })).toBeVisible();
      await expect.poll(async () => (await read(target)).name).toBe("QA Copy Target Renamed");
      expect((await read(target)).code).toBe("QCT 1");

      // deleting asks first, naming the subject and its records
      await page.getByRole("button", { name: "Delete QA Copy Target Renamed" }).click();
      await expect(page.getByRole("dialog").getByText(/"QA Copy Target Renamed" and its 1 record/)).toBeVisible();
      await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
      await expect(page.getByRole("button", { name: "QA Copy Target Renamed", exact: true })).toBeVisible();

      // ---- copy the formula
      await page.getByRole("button", { name: "QA Copy Target Renamed", exact: true }).click();
      await page.getByRole("button", { name: "Grading settings" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Copy formula from").selectOption({ label: "QA Copy Source" });
      await dialog.getByRole("button", { name: "Copy formula" }).click();
      await expect(dialog.getByText(/Copied 2 components from "QA Copy Source"\./)).toBeVisible();
      await expect(dialog.getByText(/Skipped 1 that match no column here: Class work › Project/)).toBeVisible();
      await expect(dialog.getByText(/The weights now add up to 80\.00/)).toBeVisible();
      await expect(dialog.getByLabel("Component", { exact: true })).toHaveCount(2); // Quizzes and Final: Project was skipped

      // adjust to reach 100 and save
      const shares = dialog.getByLabel("% of final");
      await expect(shares).toHaveCount(2);
      await shares.nth(1).fill("80");
      await dialog.getByRole("button", { name: "Save formula" }).click();
      await expect
        .poll(async () => JSON.stringify(((await read(target)).gradingSystem?.categories ?? []).map((c) => [c.name, c.weight, c.components.map((x) => [x.name, x.weight, x.gradeKeys])])))
        .toBe(JSON.stringify([["Class work", 20, [["Quizzes", 20, ["q1"]]]], ["Exams", 80, [["Final", 80, ["E1"]]]]]));
    } finally {
      for (const id of made) await request.delete(`${API}/grade-subjects/${id}`, { headers });
      await request.patch(`${API}/auth/me/experimental-features`, { headers, data: { enabled: prefs.enabled, features: prefs.features } });
    }
  });
});
