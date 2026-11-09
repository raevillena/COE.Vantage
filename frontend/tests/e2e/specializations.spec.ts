import { test, expect } from "@playwright/test";
import { API, PASSWORD, login } from "./support";

const COE = "00000000-0000-0000-0000-0000000000a2";

test.describe("curriculum specializations", () => {
  test("common, shared and unique subjects per specialization; the curriculum viewer manages and filters them", async ({ page, request }) => {
    test.setTimeout(120_000);
    page.setDefaultTimeout(10_000);
    const auth = await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } });
    const login1 = (await auth.json()) as { accessToken: string; user: { id: string } };
    const headers = { Authorization: `Bearer ${login1.accessToken}`, "X-College-Id": COE };
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [`cv_view_college_${login1.user.id}`, COE]);

    const curriculumIds: string[] = [];
    const subjectIds: string[] = [];
    const makeCurriculum = async (name: string) => {
      const r = await request.post(`${API}/curriculum`, { headers, data: { name } });
      expect(r.status(), await r.text()).toBe(201);
      const id = ((await r.json()) as { id: string }).id;
      curriculumIds.push(id);
      return id;
    };
    const makeSubject = async (curriculumId: string, code: string) => {
      const r = await request.post(`${API}/subjects`, { headers, data: { code, name: `QA ${code}`, lecUnits: 3, labUnits: 0, yearLevel: 3, semester: 1, curriculumId } });
      expect(r.status(), await r.text()).toBe(201);
      const id = ((await r.json()) as { id: string }).id;
      subjectIds.push(id);
      return id;
    };
    const codesFor = async (curriculumId: string, specializationId?: string) => {
      const q = specializationId ? `?specializationId=${specializationId}` : "";
      const rows = (await (await request.get(`${API}/curriculum/${curriculumId}/subjects${q}`, { headers })).json()) as { code: string }[];
      return rows.map((r) => r.code).sort();
    };
    try {
      const cur = await makeCurriculum("QA Spec Curriculum");
      const other = await makeCurriculum("QA Spec Other");
      const common = await makeSubject(cur, "QAS 100");
      const unique = await makeSubject(cur, "QAS 200");
      const shared = await makeSubject(cur, "QAS 300");

      const add = async (name: string) => {
        const r = await request.post(`${API}/curriculum/${cur}/specializations`, { headers, data: { name } });
        expect(r.status(), await r.text()).toBe(201);
        return ((await r.json()) as { id: string }).id;
      };
      const soft = await add("QA Software");
      const net = await add("QA Networks");
      const iot = await add("QA Embedded");
      // names are unique inside a curriculum, whatever the case
      expect((await request.post(`${API}/curriculum/${cur}/specializations`, { headers, data: { name: "qa software" } })).status()).toBe(409);

      // common = no tag; unique = one specialization; shared = two of the three
      const tag = (subjectId: string, ids: string[], curriculumId = cur) => request.put(`${API}/curriculum/${curriculumId}/subjects/${subjectId}/specializations`, { headers, data: { specializationIds: ids } });
      expect((await tag(unique, [soft])).status()).toBe(200);
      expect((await tag(shared, [soft, net])).status()).toBe(200);

      // what a class of each specialization takes: the common subjects plus its own
      expect(await codesFor(cur)).toEqual(["QAS 100", "QAS 200", "QAS 300"]);
      expect(await codesFor(cur, soft)).toEqual(["QAS 100", "QAS 200", "QAS 300"]);
      expect(await codesFor(cur, net)).toEqual(["QAS 100", "QAS 300"]);
      expect(await codesFor(cur, iot)).toEqual(["QAS 100"]);

      // a specialization of another curriculum cannot be used
      const foreign = await request.post(`${API}/curriculum/${other}/specializations`, { headers, data: { name: "QA Foreign" } });
      const foreignId = ((await foreign.json()) as { id: string }).id;
      expect((await tag(common, [foreignId])).status()).toBe(400);

      // ---- the curriculum viewer
      await login(page, "admin@coe.vantage");
      await page.goto("/curriculum");
      await page.getByLabel("Search curriculum").fill("QA Spec Curriculum");
      await page.getByRole("button", { name: "View" }).first().click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("cell", { name: "QAS 200", exact: true })).toBeVisible();
      const row = (code: string) => dialog.locator("tbody tr", { hasText: code });
      await expect(row("QAS 100")).toContainText("Common");
      await expect(row("QAS 200")).toContainText("QA Software");
      await expect(row("QAS 300")).toContainText("QA Software");
      await expect(row("QAS 300")).toContainText("QA Networks");

      // filter: what the Networks specialization takes
      await dialog.getByLabel("Filter by specialization").selectOption({ label: "QA Networks: common + its own" });
      await expect(row("QAS 100")).toBeVisible();
      await expect(row("QAS 300")).toBeVisible();
      await expect(row("QAS 200")).toHaveCount(0);
      await dialog.getByLabel("Filter by specialization").selectOption({ label: "Common subjects only" });
      await expect(dialog.locator("tbody tr")).toHaveCount(1);
      await dialog.getByLabel("Filter by specialization").selectOption({ label: "All subjects" });

      // tag a subject from the viewer: QAS 100 also becomes part of Embedded only
      await dialog.getByRole("button", { name: "Set specializations of QAS 100" }).click();
      const editor = page.getByRole("dialog").last();
      await editor.getByRole("checkbox", { name: "QA Embedded" }).check();
      await editor.getByRole("button", { name: "Save" }).click();
      await expect(row("QAS 100")).toContainText("QA Embedded");
      expect(await codesFor(cur, soft)).toEqual(["QAS 200", "QAS 300"]);

      // ---- removing a specialization frees its subjects
      expect((await request.delete(`${API}/curriculum/specializations/${soft}`, { headers })).status()).toBe(204);
      const afterRemove = (await (await request.get(`${API}/curriculum/${cur}/subjects`, { headers })).json()) as { code: string; specializations: { name: string }[] }[];
      const tagsOf = (code: string) => afterRemove.find((s) => s.code === code)!.specializations.map((s) => s.name);
      expect(tagsOf("QAS 200")).toEqual([]); // was only Software: common now
      expect(tagsOf("QAS 300")).toEqual(["QA Networks"]);
      expect(tagsOf("QAS 100")).toEqual(["QA Embedded"]);

      // ---- a subject moved to another curriculum loses its tags
      const moved = await request.patch(`${API}/subjects/${shared}`, { headers, data: { curriculumId: other } });
      expect(moved.status(), await moved.text()).toBe(200);
      expect(await codesFor(cur, net)).toEqual(["QAS 200"]);
      const back = await request.patch(`${API}/subjects/${shared}`, { headers, data: { curriculumId: cur } });
      expect(back.status()).toBe(200);
      const backRows = (await (await request.get(`${API}/curriculum/${cur}/subjects`, { headers })).json()) as { code: string; specializations: unknown[] }[];
      expect(backRows.find((s) => s.code === "QAS 300")!.specializations).toEqual([]);

      // ---- a faculty member cannot change them
      const fac = await request.post(`${API}/auth/login`, { data: { email: "faculty1@coe.vantage", password: PASSWORD } });
      const facHeaders = { Authorization: `Bearer ${((await fac.json()) as { accessToken: string }).accessToken}` };
      expect((await request.post(`${API}/curriculum/${cur}/specializations`, { headers: facHeaders, data: { name: "QA Nope" } })).status()).toBeGreaterThanOrEqual(400);
    } finally {
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

  test("a class with a specialization takes the common subjects plus its own", async ({ page, request }) => {
    test.setTimeout(120_000);
    page.setDefaultTimeout(10_000);
    const auth = await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } });
    const login1 = (await auth.json()) as { accessToken: string; user: { id: string } };
    const headers = { Authorization: `Bearer ${login1.accessToken}`, "X-College-Id": COE };
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [`cv_view_college_${login1.user.id}`, COE]);

    const curriculumIds: string[] = [];
    const subjectIds: string[] = [];
    const classIds: string[] = [];
    const post = async (path: string, data: unknown) => {
      const r = await request.post(`${API}${path}`, { headers, data });
      expect(r.status(), await r.text()).toBe(201);
      return (await r.json()) as { id: string };
    };
    try {
      const cur = (await post("/curriculum", { name: "QA Class Spec Curriculum" })).id;
      curriculumIds.push(cur);
      const other = (await post("/curriculum", { name: "QA Class Spec Other" })).id;
      curriculumIds.push(other);
      // year level 1, no semester, so they show whatever term the scheduler opens on
      const subject = async (code: string) => {
        const id = (await post("/subjects", { code, name: `QA ${code}`, lecUnits: 3, labUnits: 0, yearLevel: 1, curriculumId: cur })).id;
        subjectIds.push(id);
        return id;
      };
      const common = await subject("QAC 100");
      const onlyA = await subject("QAC 200");
      const onlyB = await subject("QAC 300");
      const both = await subject("QAC 400");
      const specA = (await post(`/curriculum/${cur}/specializations`, { name: "QA Track A" })).id;
      const specB = (await post(`/curriculum/${cur}/specializations`, { name: "QA Track B" })).id;
      const foreign = (await post(`/curriculum/${other}/specializations`, { name: "QA Foreign Track" })).id;
      const tag = (id: string, ids: string[]) => request.put(`${API}/curriculum/${cur}/subjects/${id}/specializations`, { headers, data: { specializationIds: ids } });
      await tag(onlyA, [specA]);
      await tag(onlyB, [specB]);
      await tag(both, [specA, specB]);
      void common;

      // the API: a class can only take a specialization of its own curriculum
      const bad = await request.post(`${API}/student-classes`, { headers, data: { name: "QA Spec Bad", yearLevel: 1, curriculumId: cur, specializationId: foreign, studentCount: 10 } });
      expect(bad.status()).toBe(400);
      const classA = await post("/student-classes", { name: "QA Spec Class A", yearLevel: 1, curriculumId: cur, specializationId: specA, studentCount: 30 });
      classIds.push(classA.id);
      const classNone = await post("/student-classes", { name: "QA Spec Class None", yearLevel: 1, curriculumId: cur, studentCount: 30 });
      classIds.push(classNone.id);
      const fetched = (await (await request.get(`${API}/student-classes`, { headers })).json()) as { id: string; specialization: { name: string } | null }[];
      expect(fetched.find((c) => c.id === classA.id)!.specialization?.name).toBe("QA Track A");
      expect(fetched.find((c) => c.id === classNone.id)!.specialization).toBeNull();

      // the Student classes page: shows the specialization and the form offers the curriculum's own
      await login(page, "admin@coe.vantage");
      await page.goto("/student-classes");
      await page.getByLabel("Search student classes").fill("QA Spec Class").catch(() => undefined);
      await expect(page.locator("tbody tr", { hasText: "QA Spec Class A" })).toContainText("QA Track A");
      await page.getByRole("button", { name: "Edit QA Spec Class A" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByLabel("Specialization")).toHaveValue(specA);
      await expect(dialog.getByLabel("Specialization").locator("option")).toHaveText(["No specialization (takes every subject)", "QA Track A", "QA Track B"]);
      await page.keyboard.press("Escape");

      // the Scheduler's subject list: class A sees common + Track A subjects, the class with none sees all
      await page.goto("/scheduler");
      await page.getByText("Select class").first().click();
      await page.getByRole("option", { name: "QA Spec Class A" }).click();
      const tree = page.getByText(/^Subjects · QA Class Spec Curriculum/).first();
      await expect(tree).toContainText("QA Track A");
      await expect(page.getByText("QAC 100").first()).toBeVisible();
      await expect(page.getByText("QAC 200").first()).toBeVisible();
      await expect(page.getByText("QAC 400").first()).toBeVisible();
      await expect(page.getByText("QAC 300")).toHaveCount(0);

      await page.getByText("QA Spec Class A").first().click();
      await page.getByRole("option", { name: "QA Spec Class None" }).click();
      await expect(page.getByText("QAC 300").first()).toBeVisible();

      // moving a class to another curriculum clears its specialization
      const moved = await request.patch(`${API}/student-classes/${classA.id}`, { headers, data: { curriculumId: other } });
      expect(moved.status(), await moved.text()).toBe(200);
      expect(((await moved.json()) as { specializationId: string | null }).specializationId).toBeNull();
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

  test("the curriculum build page tags subjects, filters by specialization and adds new ones for the specialization", async ({ page, request }) => {
    test.setTimeout(120_000);
    page.setDefaultTimeout(10_000);
    const auth = await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } });
    const login1 = (await auth.json()) as { accessToken: string; user: { id: string } };
    const headers = { Authorization: `Bearer ${login1.accessToken}`, "X-College-Id": COE };
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [`cv_view_college_${login1.user.id}`, COE]);

    const curriculumIds: string[] = [];
    const subjectIds: string[] = [];
    const post = async (path: string, data: unknown) => {
      const r = await request.post(`${API}${path}`, { headers, data });
      expect(r.status(), await r.text()).toBe(201);
      return (await r.json()) as { id: string };
    };
    try {
      const cur = (await post("/curriculum", { name: "QA Build Spec" })).id;
      curriculumIds.push(cur);
      const mk = async (code: string, extra: object = {}) => {
        const id = (await post("/subjects", { code, name: `QA ${code}`, lecUnits: 3, labUnits: 0, ...extra })).id;
        subjectIds.push(id);
        return id;
      };
      const common = await mk("QAB 100", { curriculumId: cur, yearLevel: 1, semester: 1 });
      const unique = await mk("QAB 200", { curriculumId: cur, yearLevel: 1, semester: 1 });
      const pooled = await mk("QAB 900"); // not in any curriculum: sits in the pool
      void common;

      await login(page, "admin@coe.vantage");
      await page.goto(`/curriculum/${cur}/build`);
      // with none yet, the page offers to add specializations; the manager opens from here
      await page.getByRole("button", { name: "Add specializations" }).click();
      const manager = page.getByRole("dialog");
      await manager.getByLabel("New specialization name").fill("QA Build Track");
      await manager.getByRole("button", { name: "Add" }).click();
      await expect(manager.getByText("QA Build Track")).toBeVisible();
      await manager.getByLabel("New specialization name").fill("QA Other Track");
      await manager.getByRole("button", { name: "Add" }).click();
      await expect(manager.getByText("QA Other Track")).toBeVisible();
      await manager.getByRole("button", { name: "Close" }).click();

      // tag QAB 200 with the first track from its card
      await page.getByRole("button", { name: "Set specializations of QAB 200", exact: true }).click();
      const editor = page.getByRole("dialog");
      await editor.getByRole("checkbox", { name: "QA Build Track" }).check();
      await editor.getByRole("button", { name: "Save" }).click();
      const card = (code: string) => page.locator("div[title]", { hasText: code }).filter({ hasText: "×" });
      await expect(card("QAB 200")).toContainText("QA Build Track");

      // work on the other track: QAB 200 is not part of it, common QAB 100 is
      await page.getByLabel("Specialization view").selectOption({ label: "QA Other Track: common + its own (new ones are its own)" });
      await expect(card("QAB 100")).toBeVisible();
      await expect(card("QAB 200")).toHaveCount(0);
      await expect(page.getByText("added for QA Other Track only")).toBeVisible();

      // drag a pooled subject into Year 2, 1st Sem: it becomes a subject of the track being worked on
      const source = page.locator("div[title]", { hasText: "QAB 900" }).first();
      const target = page.locator("div", { hasText: /^1st Sem/ }).nth(5); // Year 2 first semester
      await source.scrollIntoViewIfNeeded();
      const from = await source.boundingBox();
      const to = await target.boundingBox();
      expect(from && to).toBeTruthy();
      await page.mouse.move(from!.x + 20, from!.y + 10);
      await page.mouse.down();
      await page.mouse.move(from!.x + 40, from!.y + 30, { steps: 4 });
      await page.mouse.move(to!.x + 40, to!.y + 20, { steps: 12 });
      await page.mouse.up();
      await expect(page.getByText(/Added to Year 2 — 1st Sem for QA Other Track/)).toBeVisible();
      const rows = (await (await request.get(`${API}/curriculum/${cur}/subjects`, { headers })).json()) as { id: string; code: string; yearLevel: number; specializations: { name: string }[] }[];
      const added = rows.find((r) => r.code === "QAB 900")!;
      expect(added.yearLevel).toBe(2);
      expect(added.specializations.map((s) => s.name)).toEqual(["QA Other Track"]);
      subjectIds.push(added.id);
      void unique;
      void pooled;
    } finally {
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
