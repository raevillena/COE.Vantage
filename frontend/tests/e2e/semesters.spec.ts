import { test, expect } from "@playwright/test";
import { API, PASSWORD, login } from "./support";

const COE = "00000000-0000-0000-0000-0000000000a2";

interface CollegeRow {
  id: string;
  currentAcademicYearId: string | null;
  currentSemester: number | null;
  calendarAcademicYearId: string | null;
  calendarSemester: number | null;
}

test.describe("Current Semester vs Scheduling Semester", () => {
  test("scheduling pages follow the Scheduling Semester, faculty pages and grades the Current Semester", async ({ page, browser, request }) => {
    test.setTimeout(120_000);
    page.setDefaultTimeout(10_000);
    const auth = await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } });
    const login1 = (await auth.json()) as { accessToken: string; user: { id: string } };
    const headers = { Authorization: `Bearer ${login1.accessToken}` };
    // The admin looks at one college at a time: the College of Engineering.
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [`cv_view_college_${login1.user.id}`, COE]);
    const asCollege = { ...headers, "X-College-Id": COE };
    const colleges = (await (await request.get(`${API}/colleges`, { headers })).json()) as CollegeRow[];
    const before = colleges.find((c) => c.id === COE)!;
    const years = (await (await request.get(`${API}/academic-years`, { headers: asCollege })).json()) as { id: string; name: string }[];
    const year = years[0];
    const setTerm = (kind: "scheduling" | "current", academicYearId: string | null, semester?: number) =>
      request.put(`${API}/academic-years/current-term`, { headers, data: { kind, academicYearId, semester, collegeId: COE } });
    let subjectId = "";
    const prefs = (await (await request.get(`${API}/auth/me/experimental-features`, { headers })).json()) as { enabled: boolean; features: string[] };
    try {
      // Scheduling = 2nd Sem, Current = 1st Sem.
      expect((await setTerm("scheduling", year.id, 2)).status()).toBe(200);
      expect((await setTerm("current", year.id, 1)).status()).toBe(200);

      // The API tells the two apart.
      const list = (await (await request.get(`${API}/academic-years/for-schedules`, { headers: asCollege })).json()) as {
        id: string; isActive: boolean; currentSemester: number; isCalendar: boolean; calendarSemester: number;
      }[];
      const mine = list.find((y) => y.id === year.id)!;
      expect(mine).toMatchObject({ isActive: true, currentSemester: 2, isCalendar: true, calendarSemester: 1 });

      // Admin, viewing the College of Engineering: the dashboard opens on the Scheduling Semester, the selector says Scheduling Semester.
      await login(page, "admin@coe.vantage");
      await expect(page.getByRole("combobox", { name: "Scheduling Semester" })).toContainText("2nd Sem");
      await expect(page.getByText("Scheduling Semester", { exact: true }).first()).toBeVisible();

      // The Academic years page has both settings.
      await page.goto("/academic-years");
      await expect(page.getByRole("region", { name: "Scheduling Semester" })).toContainText("2nd Sem");
      await expect(page.getByRole("region", { name: "Current Semester" })).toContainText("1st Sem");

      // A faculty member sees only the Current Semester, and their dashboard opens on it.
      const context = await browser.newContext();
      const faculty = await context.newPage();
      faculty.setDefaultTimeout(10_000);
      await login(faculty, "faculty1@coe.vantage");
      await expect(faculty.getByRole("combobox", { name: "Current Semester" })).toContainText("1st Sem");
      // A faculty member's pages never say "Scheduling".
      await expect(faculty.getByText("Scheduling Semester")).toHaveCount(0);
      await context.close();

      // The student grade lookup opens on the Current Semester: the flag is set for a subject in it only.
      const prefsOn = await request.patch(`${API}/auth/me/experimental-features`, { headers, data: { enabled: true, features: Array.from(new Set([...prefs.features, "gradeModule"])) } });
      expect(prefsOn.status()).toBe(200);
      subjectId = ((await (await request.post(`${API}/grade-subjects`, { headers: asCollege, data: { publicViewEnabled: true, name: "QA Current Term", academicYearId: year.id, semester: 1 } })).json()) as { id: string }).id;
      await request.post(`${API}/grade-subjects/${subjectId}/records`, { headers: asCollege, data: { studentName: "QA, TERM", studentNumber: "99-440001", code: "CTA1", grades: { Q1: 5 }, maxScores: { Q1: 10 } } });
      const lookup = async () => (await (await request.get(`${API}/grade-subjects/public/records`, { params: { studentNumber: "99-440001", code: "CTA1" } })).json()) as { isCurrentTerm: boolean }[];
      expect((await lookup())[0].isCurrentTerm).toBe(true);
      await request.patch(`${API}/grade-subjects/${subjectId}`, { headers: asCollege, data: { semester: 2 } });
      expect((await lookup())[0].isCurrentTerm).toBe(false);

      // Clearing the Current Semester makes it follow the Scheduling Semester again.
      expect((await setTerm("current", null)).status()).toBe(200);
      const followed = (await (await request.get(`${API}/academic-years/for-schedules`, { headers: asCollege })).json()) as { id: string; isCalendar: boolean; calendarSemester: number }[];
      expect(followed.find((y) => y.id === year.id)).toMatchObject({ isCalendar: true, calendarSemester: 2 });
    } finally {
      if (subjectId) await request.delete(`${API}/grade-subjects/${subjectId}`, { headers: asCollege });
      await request.patch(`${API}/auth/me/experimental-features`, { headers, data: { enabled: prefs.enabled, features: prefs.features } });
      // Put the college's two settings back exactly as they were.
      await setTerm("scheduling", before.currentAcademicYearId, before.currentSemester ?? undefined);
      await setTerm("current", before.calendarAcademicYearId, before.calendarSemester ?? undefined);
    }
  });
});
