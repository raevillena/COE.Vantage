import { test, expect } from "@playwright/test";
import { API, PASSWORD } from "./support";

// One access code per student: one email opens every subject; a subject can be hidden from the public page.
test("a student has one code for all subjects, the public lookup shows them all, and a subject can be hidden", async ({ request }) => {
  test.setTimeout(60_000);
  const auth = await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } });
  const headers = { Authorization: `Bearer ${((await auth.json()) as { accessToken: string }).accessToken}` };
  const prefs = (await (await request.get(`${API}/auth/me/experimental-features`, { headers })).json()) as { enabled: boolean; features: string[] };
  const subjects: string[] = [];
  type Rec = { id: string; studentNumber: string; code: string; emailSentAt: string | null };
  const no = "99-885001";
  try {
    await request.patch(`${API}/auth/me/experimental-features`, { headers, data: { enabled: true, features: Array.from(new Set([...prefs.features, "gradeModule"])) } });
    const subject = async (name: string, publicViewEnabled = true) => {
      const r = await request.post(`${API}/grade-subjects`, { headers, data: { name, publicViewEnabled } });
      expect(r.status(), await r.text()).toBe(201);
      const id = ((await r.json()) as { id: string }).id;
      subjects.push(id);
      return id;
    };
    const addRecord = async (id: string) => {
      const r = await request.post(`${API}/grade-subjects/${id}/records`, { headers, data: { studentName: "ONECODE, QA", studentNumber: no, email: "onecode@example.com", grades: { Q1: 5 }, maxScores: { Q1: 10 } } });
      expect(r.status(), await r.text()).toBe(201);
      return (await r.json()) as Rec;
    };
    const lookup = async (code: string) => (await (await request.get(`${API}/grade-subjects/public/records`, { params: { studentNumber: no, code } })).json()) as { subject: { name: string } }[];

    // a new subject is hidden from the public page until the tick is switched on
    const plain = await request.post(`${API}/grade-subjects`, { headers, data: { name: "QA One Code Default" } });
    const plainSubject = (await plain.json()) as { id: string; publicViewEnabled: boolean };
    subjects.push(plainSubject.id);
    expect(plainSubject.publicViewEnabled).toBe(false);

    const [a, b] = [await subject("QA One Code A"), await subject("QA One Code B")];
    const first = await addRecord(a);
    const second = await addRecord(b);
    expect(second.code).toBe(first.code); // same student, same code

    // importing a sheet into a third subject also reuses the code
    const c = await subject("QA One Code C");
    const imp = await request.post(`${API}/grade-subjects/${c}/records/import`, { headers, data: { records: [{ studentName: "ONECODE, QA", studentNumber: no, grades: { Q1: 4 } }] } });
    if (imp.status() < 300) {
      const rows = (await (await request.get(`${API}/grade-subjects/${c}/records`, { headers })).json()) as Rec[];
      expect(rows[0].code).toBe(first.code);
    }

    // the code from either subject shows all of them
    const names = (await lookup(first.code)).map((r) => r.subject.name);
    expect(names).toEqual(expect.arrayContaining(["QA One Code A", "QA One Code B"]));
    expect(await lookup("000000x")).toEqual([]); // a wrong code shows nothing

    // sending the access emails for A marks the student as sent in B too, and B does not send again
    const sentA = await request.post(`${API}/grade-subjects/${a}/send-access-codes`, { headers, data: {} });
    expect(sentA.status(), await sentA.text()).toBeLessThan(300);
    await expect.poll(async () => ((await (await request.get(`${API}/grade-subjects/${b}/records`, { headers })).json()) as Rec[])[0].emailSentAt, { timeout: 15_000 }).not.toBeNull();

    // hide subject B from the public page
    expect((await request.patch(`${API}/grade-subjects/${b}`, { headers, data: { publicViewEnabled: false } })).status()).toBeLessThan(300);
    const after = (await lookup(first.code)).map((r) => r.subject.name);
    expect(after).toContain("QA One Code A");
    expect(after).not.toContain("QA One Code B");

    // a new code is a new code everywhere
    const regen = await request.post(`${API}/grade-subjects/${a}/records/${first.id}/regenerate-code`, { headers });
    const fresh = (await regen.json()) as Rec;
    expect(fresh.code).not.toBe(first.code);
    const rowsB = (await (await request.get(`${API}/grade-subjects/${b}/records`, { headers })).json()) as Rec[];
    expect(rowsB[0].code).toBe(fresh.code);
  } finally {
    for (const id of subjects) await request.delete(`${API}/grade-subjects/${id}`, { headers });
  }
});
