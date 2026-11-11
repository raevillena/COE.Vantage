import { test, expect } from "@playwright/test";
import { API, PASSWORD, login } from "./support";

const COE = "00000000-0000-0000-0000-0000000000a2";

test("the Requests page filters by who asked and by the asker's department", async ({ page, request }) => {
  test.setTimeout(120_000);
  type Named = { id: string };
  const tok = async (email: string) => ((await (await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } })).json()) as { accessToken: string }).accessToken;
  const bearer = async (email: string) => ({ Authorization: `Bearer ${await tok(email)}` });
  const admin = await bearer("admin@coe.vantage");
  const stamp = Date.now();
  const made = { users: [] as string[], depts: [] as string[], curr: "", subj: "", cls: "", requests: [] as string[] };
  const years = (await (await request.get(`${API}/academic-years`, { headers: admin })).json()) as { id: string; isActive: boolean; currentSemester?: number }[];
  const ay = years.find((y) => y.isActive) ?? years[0];
  const semester = ay.currentSemester === 2 ? 2 : 1;
  const post = async <T,>(path: string, data: object, headers = admin) => {
    const r = await request.post(`${API}${path}`, { headers, data });
    expect(r.status(), `${path} ${await r.text()}`).toBe(201);
    return (await r.json()) as T;
  };
  try {
    const deptA = (await post<Named>("/departments", { name: `Flt Dept A ${stamp} (FA${stamp % 1000})`, collegeId: COE })).id;
    const deptC = (await post<Named>("/departments", { name: `Flt Dept C ${stamp} (FC${stamp % 1000})`, collegeId: COE })).id;
    const deptB = (await post<Named>("/departments", { name: `Flt Own Dept ${stamp} (FO${stamp % 1000})`, collegeId: COE })).id;
    made.depts.push(deptA, deptC, deptB);
    const person = async (prefix: string, role: string, departmentId: string) => {
      const email = `${prefix}${stamp}@coe.vantage`;
      const u = await post<Named>("/users", { email, password: PASSWORD, name: `${prefix} ${stamp}`, role, collegeId: COE, departmentId });
      made.users.push(u.id);
      return { id: u.id, headers: await bearer(email) };
    };
    const askerA = await person("fltaskera", "CHAIRMAN", deptA);
    const askerC = await person("fltaskerc", "CHAIRMAN", deptC);
    const faculty = await person("fltfac", "FACULTY", deptB);
    made.curr = (await post<Named>("/curriculum", { name: `FLT Curr ${stamp}`, departmentId: deptA })).id;
    made.subj = (await post<Named>("/subjects", { code: `FL${stamp % 100000}`, name: "Filter subject", lecUnits: 3, curriculumId: made.curr, collegeId: COE })).id;
    made.cls = (await post<Named>("/student-classes", { name: `FLT Class ${stamp}`, yearLevel: 1, curriculumId: made.curr, studentCount: 30 })).id;
    const ask = async (headers: Record<string, string>, day: number) => {
      const r = await post<Named>(
        "/assignment-requests",
        { facultyId: faculty.id, subjectId: made.subj, studentClassId: made.cls, roomDisplayName: "Off-site", dayOfWeek: day, startTime: "9:00", endTime: "10:00", semester, academicYearId: ay.id },
        headers
      );
      made.requests.push(r.id);
    };
    await ask(askerA.headers, 1);
    await ask(askerC.headers, 2);

    await login(page, "admin@coe.vantage");
    await page.goto("/requests");
    const rows = page.getByRole("row").filter({ hasText: `fltfac ${stamp}` });
    await expect(rows).toHaveCount(2);

    // by requestor
    await page.getByLabel("Filter by requestor", { exact: true }).selectOption({ label: `fltaskera ${stamp}` });
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(`fltaskera ${stamp}`);
    // by the asker's department, after clearing the requestor
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(rows).toHaveCount(2);
    await page.getByLabel("Filter by requestor department").selectOption({ label: `Flt Dept C ${stamp} (FC${stamp % 1000})` });
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(`fltaskerc ${stamp}`);
  } finally {
    for (const id of made.requests) await request.post(`${API}/assignment-requests/${id}/cancel`, { headers: admin }).catch(() => undefined);
    const left = (await (await request.get(`${API}/faculty-loads?studentClassId=${made.cls}`, { headers: admin })).json()) as unknown;
    if (Array.isArray(left)) for (const l of left as { id: string }[]) await request.delete(`${API}/faculty-loads/${l.id}`, { headers: admin });
    for (const id of made.users) await request.delete(`${API}/users/${id}`, { headers: admin });
    for (const [path, id] of [["/student-classes", made.cls], ["/subjects", made.subj], ["/curriculum", made.curr]]) if (id) await request.delete(`${API}${path}/${id}`, { headers: admin });
    for (const id of made.depts) await request.delete(`${API}/departments/${id}`, { headers: admin });
  }
});
