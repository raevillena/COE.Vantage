import { test, expect } from "@playwright/test";
import { API, PASSWORD } from "./support";

// A component can add its columns' points (default) or average each column's score/max, so every column counts the same.
test("a component can average each column's percentage instead of adding the points", async ({ request }) => {
  test.setTimeout(60_000);
  const auth = await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } });
  const headers = { Authorization: `Bearer ${((await auth.json()) as { accessToken: string }).accessToken}` };
  const prefs = (await (await request.get(`${API}/auth/me/experimental-features`, { headers })).json()) as { enabled: boolean; features: string[] };
  let id = "";
  try {
    await request.patch(`${API}/auth/me/experimental-features`, { headers, data: { enabled: true, features: Array.from(new Set([...prefs.features, "gradeModule"])) } });
    id = ((await (await request.post(`${API}/grade-subjects`, { headers, data: { name: "QA Average Method" } })).json()) as { id: string }).id;
    const setFormula = async (componentMethod?: "points" | "average") => {
      const r = await request.patch(`${API}/grade-subjects/${id}`, {
        headers,
        data: { gradingSystem: { categories: [{ name: "All", weight: 100, components: [{ name: "Quizzes", weight: 100, gradeKeys: ["Q1", "Q2"] }] }], ...(componentMethod ? { componentMethod } : {}) } },
      });
      expect(r.status(), await r.text()).toBe(200);
    };
    // Q1 is 10/10 and Q2 is 0/100
    const imp = await request.post(`${API}/grade-subjects/${id}/records/import`, {
      headers,
      data: { records: [{ studentName: "AVERAGE, QA", studentNumber: "99-886001", grades: { Q1: 10, Q2: 0 }, maxScores: { Q1: 10, Q2: 100 } }] },
    });
    expect(imp.status(), await imp.text()).toBe(201);
    const final = async () => {
      const r = await request.post(`${API}/grade-subjects/${id}/compute-grades`, { headers });
      expect(r.status(), await r.text()).toBeLessThan(300);
      const rows = (await (await request.get(`${API}/grade-subjects/${id}/records`, { headers })).json()) as { computedGrade: { finalGrade: number } | null }[];
      return rows[0].computedGrade?.finalGrade;
    };
    await setFormula(); // no method set: points are added, 10 / 110
    expect(await final()).toBeCloseTo(9.09, 2);
    await setFormula("points");
    expect(await final()).toBeCloseTo(9.09, 2);
    await setFormula("average"); // (100% + 0%) / 2
    expect(await final()).toBeCloseTo(50, 2);
  } finally {
    if (id) await request.delete(`${API}/grade-subjects/${id}`, { headers });
  }
});
