import { test, expect } from "@playwright/test";
import { API, PASSWORD } from "./support";

const COE = "00000000-0000-0000-0000-0000000000a2";

test("a curriculum moved to Trash takes its subjects along, and restoring it brings back only those", async ({ request }) => {
  const token = ((await (await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } })).json()) as { accessToken: string }).accessToken;
  const headers = { Authorization: `Bearer ${token}`, "X-College-Id": COE };
  const stamp = Date.now();
  type Named = { id: string };
  const get = async <T,>(path: string) => (await (await request.get(`${API}${path}`, { headers })).json()) as T;
  const post = async <T,>(path: string, data: object = {}) => {
    const r = await request.post(`${API}${path}`, { headers, data });
    expect(r.status(), `${path} ${await r.text()}`).toBeLessThan(300);
    return (await r.json().catch(() => ({}))) as T;
  };
  const departments = await get<Named[]>("/departments");
  test.skip(departments.length === 0, "needs a department");
  const made = { curr: "", subjects: [] as string[] };
  try {
    made.curr = (await post<Named>("/curriculum", { name: `QA Trash Curr ${stamp}`, departmentId: departments[0].id })).id;
    const subject = async (n: number) => {
      const s = await post<Named>("/subjects", { code: `QT${stamp % 100000}${n}`, name: `QA trash subject ${n}`, lecUnits: 3, curriculumId: made.curr, collegeId: COE });
      made.subjects.push(s.id);
      return s.id;
    };
    const [a, b] = [await subject(1), await subject(2)];
    const active = async () => (await get<Named[]>("/subjects")).map((s) => s.id);
    const trashed = async () => (await get<Named[]>("/subjects/trash")).map((s) => s.id);

    // subject b was deleted on its own, earlier
    expect((await request.delete(`${API}/subjects/${b}`, { headers })).status()).toBe(204);
    expect(await active()).toContain(a);

    // the curriculum goes to Trash: subject a goes with it
    expect((await request.delete(`${API}/curriculum/${made.curr}`, { headers })).status()).toBe(204);
    expect(await active()).not.toContain(a);
    expect(await trashed()).toEqual(expect.arrayContaining([a, b]));

    // a subject cannot be restored on its own while its curriculum is in Trash
    const early = await request.post(`${API}/subjects/${a}/restore`, { headers });
    expect(early.status()).toBe(400);
    expect(((await early.json()) as { message: string }).message).toMatch(/Restore the curriculum first/);

    // restoring the curriculum brings back subject a, not the one deleted earlier
    expect((await request.post(`${API}/curriculum/${made.curr}/restore`, { headers })).status()).toBeLessThan(300);
    expect(await active()).toContain(a);
    expect(await active()).not.toContain(b);
    expect(await trashed()).toContain(b);
  } finally {
    // clean up for good: subjects first, then the curriculum
    for (const id of made.subjects) {
      await request.delete(`${API}/subjects/${id}`, { headers });
      await request.delete(`${API}/subjects/trash/${id}`, { headers });
    }
    if (made.curr) {
      await request.delete(`${API}/curriculum/${made.curr}`, { headers });
      await request.delete(`${API}/curriculum/trash/${made.curr}`, { headers });
    }
  }
});
