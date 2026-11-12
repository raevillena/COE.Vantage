import { test, expect } from "@playwright/test";
import { API, PASSWORD, ensureCeClass, removeCeClass } from "./support";

const COE = "00000000-0000-0000-0000-0000000000a2";

// A subject with a lecture and a laboratory part: a person who has only one of them is credited only for it.
test("units count the hours a person teaches in a subject, not the whole subject", async ({ request }) => {
  test.setTimeout(60_000);
  const auth = await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } });
  const headers = { Authorization: `Bearer ${((await auth.json()) as { accessToken: string }).accessToken}`, "X-College-Id": COE };
  const get = async <T>(path: string) => (await (await request.get(`${API}${path}`, { headers })).json()) as T;
  const cls = await ensureCeClass(request);
  const ay = await get<{ id: string; currentSemester?: number }>("/academic-years/active");
  const semester = ay.currentSemester ?? 1;
  const users = await get<{ id: string; name: string }[]>("/users?role=FACULTY");
  const faculty = users.find((u) => u.name.includes("Maria Santos"));
  const room = (await get<{ id: string; name: string }[]>("/rooms")).find((r) => r.name === "CE-201");
  test.skip(!cls || !faculty || !room, "needs the seeded CE data");
  const created: string[] = [];
  let subjectId = "";
  try {
    const s = await request.post(`${API}/subjects`, { headers, data: { code: `QUC${Date.now() % 100000}`, name: "QA lec and lab", lecUnits: 3, labUnits: 1, collegeId: COE } });
    expect(s.status(), await s.text()).toBe(201);
    subjectId = ((await s.json()) as { id: string }).id;
    const units = async () => (await get<Record<string, number>>(`/faculty-loads/units?academicYearId=${ay.id}&semester=${semester}`))[faculty!.id] ?? 0;
    const base = await units();
    const block = async (dayOfWeek: number, startTime: string, endTime: string) => {
      const r = await request.post(`${API}/faculty-loads`, { headers, data: { studentClassId: cls!.id, semester, academicYearId: ay.id, subjectId, roomId: room!.id, facultyId: faculty!.id, dayOfWeek, startTime, endTime } });
      expect(r.status(), await r.text()).toBe(201);
      created.push(((await r.json()) as { id: string }).id);
    };
    // only the laboratory: one 3-hour block is worth 3, not the 6 of the whole subject
    await block(6, "07:00", "10:00");
    expect((await units()) - base).toBeCloseTo(3, 5);
    // the lecture as well: now the whole subject, 6
    await block(6, "10:00", "13:00");
    expect((await units()) - base).toBeCloseTo(6, 5);
    // never more than the subject is worth
    await block(6, "13:00", "16:00");
    expect((await units()) - base).toBeCloseTo(6, 5);
  } finally {
    for (const id of created.reverse()) await request.delete(`${API}/faculty-loads/${id}`, { headers });
    if (subjectId) {
      await request.delete(`${API}/subjects/${subjectId}`, { headers });
      await request.delete(`${API}/subjects/trash/${subjectId}`, { headers });
    }
    await removeCeClass(request);
  }
});
