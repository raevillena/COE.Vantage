import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.E2E_PASSWORD ?? "Test123!";
const API = process.env.E2E_API_URL ?? "http://localhost:4000";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("login page", () => {
  test("shows the release notes", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "What's new" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "What's new" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "v0.3.4" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "v0.3.3" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "v0.0.1" })).toBeVisible();
  });
});

test.describe("chairman", () => {
  test("dashboard overview, detail drill-down and faculty page", async ({ page }) => {
    await login(page, "chairman@coe.vantage");
    await expect(page.getByRole("heading", { name: "Term overview" })).toBeVisible();
    await expect(page.getByText("Curriculum scheduled")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Projected completion" })).toBeVisible();

    await page.getByRole("link", { name: /Faculty load used/ }).click();
    await expect(page.getByRole("heading", { name: "Faculty workload" })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();

    await page.goto("/faculty");
    await expect(page.getByRole("heading", { name: "Faculty", exact: true })).toBeVisible();
    await expect(page.getByText("Chairman (you)")).toBeVisible();
    await page.getByRole("button", { name: "Copy possible subjects from another term" }).click();
    await expect(page.getByRole("dialog").getByText("Copy possible subjects")).toBeVisible();
  });

  test("possible subjects dialog filters by semester and curriculum", async ({ page }) => {
    await login(page, "chairman@coe.vantage");
    await page.goto("/faculty");
    await page.getByRole("button", { name: /Manage possible subjects for/ }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Offered")).toBeVisible();
    await expect(dialog.getByLabel("Curriculum")).toBeVisible();
    await expect(dialog.getByText(/only\. Other terms are not changed/)).toBeVisible();
  });
});

test.describe("admin", () => {
  test("reports page exports the registrar Excel forms", async ({ page }) => {
    await login(page, "admin@coe.vantage");
    await page.goto("/reports");
    const classBtn = page.getByRole("button", { name: "Export Class Schedules" });
    await expect(classBtn).toBeVisible();
    await expect(classBtn).toBeEnabled();

    const [classDownload] = await Promise.all([page.waitForEvent("download"), classBtn.click()]);
    expect(classDownload.suggestedFilename()).toMatch(/class-schedules.*\.xlsx$/);

    const facultyBtn = page.getByRole("button", { name: "Export Faculty Workloads" });
    const [facultyDownload] = await Promise.all([page.waitForEvent("download"), facultyBtn.click()]);
    expect(facultyDownload.suggestedFilename()).toMatch(/faculty-workloads.*\.xlsx$/);
  });

  test("dashboard projection detail", async ({ page }) => {
    await login(page, "admin@coe.vantage");
    await page.getByRole("link", { name: "See subject-by-subject estimate" }).click();
    await expect(page.getByRole("heading", { name: /Projected scheduling/ })).toBeVisible();
  });
});

test.describe("college secretary", () => {
  test("sees the college but cannot change anything", async ({ page }) => {
    await login(page, "secretary@coe.vantage");
    await expect(page.getByRole("heading", { name: "Term overview" })).toBeVisible();
    await expect(page.getByText("College of Engineering").first()).toBeVisible();

    const nav = page.getByRole("navigation");
    await expect(nav.getByRole("link", { name: "Subjects" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Scheduler" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Users" })).toHaveCount(0);

    await page.goto("/subjects");
    await expect(page.getByRole("heading", { name: "Subjects" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Subject" })).toHaveCount(0);

    await page.goto("/student-classes");
    await expect(page.getByRole("heading", { name: "Student Classes" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Student Class" })).toHaveCount(0);

    await page.goto("/scheduler");
    await page.waitForURL("**/dashboard");

    await page.goto("/reports");
    await expect(page.getByRole("button", { name: "Export Class Schedules" })).toBeVisible();
  });

  test("the server rejects writes", async ({ request }) => {
    const res = await request.post(`${API}/auth/login`, {
      data: { email: "secretary@coe.vantage", password: PASSWORD },
    });
    expect(res.ok()).toBeTruthy();
    const { accessToken } = (await res.json()) as { accessToken: string };
    const headers = { Authorization: `Bearer ${accessToken}` };

    expect((await request.get(`${API}/subjects`, { headers })).status()).toBe(200);
    expect((await request.get(`${API}/dashboard/summary`, { headers })).status()).toBe(200);
    expect((await request.post(`${API}/subjects`, { headers, data: {} })).status()).toBe(403);
    expect((await request.post(`${API}/faculty-loads`, { headers, data: {} })).status()).toBe(403);
    expect((await request.post(`${API}/rooms`, { headers, data: {} })).status()).toBe(403);
    expect((await request.post(`${API}/users`, { headers, data: {} })).status()).toBe(403);
  });
});

test.describe("faculty", () => {
  test("has no college overview", async ({ page }) => {
    await login(page, "faculty1@coe.vantage");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Term overview" })).toHaveCount(0);
  });
});

test.describe("scheduler: repeat a block on other days", () => {
  test("ticking a day checks for conflicts and saves one block per ticked day", async ({ page, request }) => {
    const login = await request.post(`${API}/auth/login`, { data: { email: "chairman@coe.vantage", password: PASSWORD } });
    const { accessToken } = (await login.json()) as { accessToken: string };
    const headers = { Authorization: `Bearer ${accessToken}` };
    const get = async <T>(path: string) => (await (await request.get(`${API}${path}`, { headers })).json()) as T;

    const ay = await get<{ id: string }>("/academic-years/active");
    const faculty = (await get<{ id: string; name: string }[]>("/users?role=FACULTY")).find((u) => u.name.includes("Maria Santos"));
    const classes = await get<{ id: string; name: string }[]>("/student-classes");
    const subjects = await get<{ id: string; code: string }[]>("/subjects");
    const rooms = await get<{ id: string; name: string }[]>("/rooms");
    const cls4 = classes.find((c) => c.name === "BS CE 4A");
    const cls5 = classes.find((c) => c.name === "BS CE 5A");
    const ce101 = subjects.find((s) => s.code === "CE101");
    const ce201 = subjects.find((s) => s.code === "CE201");
    const room201 = rooms.find((r) => r.name === "CE-201");
    const room202 = rooms.find((r) => r.name === "CE-202");
    test.skip(!faculty || !cls4 || !cls5 || !ce101 || !ce201 || !room201 || !room202, "needs the seeded CE data");

    // Wednesday 5-6 PM is taken for this faculty, so ticking Wed must be refused.
    const blocker = await request.post(`${API}/faculty-loads`, {
      headers,
      data: { facultyId: faculty!.id, subjectId: ce201!.id, studentClassId: cls5!.id, roomId: room202!.id, dayOfWeek: 3, startTime: "17:00", endTime: "18:00", semester: 1, academicYearId: ay.id },
    });
    expect(blocker.ok()).toBeTruthy();
    const createdIds: string[] = [((await blocker.json()) as { id: string }).id];

    try {
      await login_(page, "chairman@coe.vantage");
      await page.goto("/scheduler");
      await page.getByRole("button", { name: /Add load/ }).first().click();
      const dialog = page.getByRole("dialog");
      const choose = async (label: string, option: string | RegExp) => {
        await dialog.getByRole("combobox", { name: label }).click();
        await page.getByRole("option", { name: option }).first().click();
      };
      await choose("Faculty", /Maria Santos/);
      await choose("Subject", /CE101/);
      await choose("Student class", "BS CE 4A");
      await choose("Room", /CE-201/);
      const times = dialog.locator('input[type="time"]');
      await times.nth(0).fill("17:00");
      await times.nth(1).fill("18:00");

      const repeat = dialog.getByRole("group", { name: "Also repeat on" });
      await expect(repeat).toBeVisible();
      await expect(repeat.getByLabel("Mon")).toBeDisabled(); // the block's own day

      await repeat.getByLabel("Wed").click(); // refused, so it stays unticked
      await expect(dialog.getByText(/Wed:.*Faculty has another class/)).toBeVisible();
      await expect(repeat.getByLabel("Wed")).not.toBeChecked();

      await repeat.getByLabel("Thu").click(); // ticks once the conflict check passes
      await expect(dialog.getByText("Thu: no conflicts")).toBeVisible();
      await expect(repeat.getByLabel("Thu")).toBeChecked();

      await dialog.getByRole("button", { name: "Check conflicts" }).click();
      await expect(dialog.getByText("No conflicts. You can save.")).toBeVisible();
      await dialog.getByRole("button", { name: "Save 2 blocks" }).click();
      await expect(page.getByText(/2 blocks added/)).toBeVisible();

      const saved = await get<{ id: string; dayOfWeek: number; subjectId: string; startTime: string }[]>(
        `/faculty-loads?studentClassId=${cls4!.id}&academicYearId=${ay.id}&semester=1`
      );
      const mine = saved.filter((l) => l.subjectId === ce101!.id && l.startTime === "17:00");
      createdIds.push(...mine.map((l) => l.id));
      expect(mine.map((l) => l.dayOfWeek).sort()).toEqual([1, 4]);
    } finally {
      for (const id of createdIds) await request.delete(`${API}/faculty-loads/${id}`, { headers });
    }
  });
});

async function login_(page: Page, email: string) {
  await login(page, email);
}

test.describe("scheduler: edit the days of a saved block", () => {
  test("a saved block shows its other days ticked and can add or remove days", async ({ page, request }) => {
    const login = await request.post(`${API}/auth/login`, { data: { email: "chairman@coe.vantage", password: PASSWORD } });
    const { accessToken } = (await login.json()) as { accessToken: string };
    const headers = { Authorization: `Bearer ${accessToken}` };
    const get = async <T>(path: string) => (await (await request.get(`${API}${path}`, { headers })).json()) as T;

    const ay = await get<{ id: string }>("/academic-years/active");
    const faculty = (await get<{ id: string; name: string }[]>("/users?role=FACULTY")).find((u) => u.name.includes("Maria Santos"));
    const cls = (await get<{ id: string; name: string }[]>("/student-classes")).find((c) => c.name === "BS CE 4A");
    const subject = (await get<{ id: string; code: string }[]>("/subjects")).find((s) => s.code === "CE101");
    const room = (await get<{ id: string; name: string }[]>("/rooms")).find((r) => r.name === "CE-201");
    test.skip(!faculty || !cls || !subject || !room, "needs the seeded CE data");

    const create = async (dayOfWeek: number) => {
      const res = await request.post(`${API}/faculty-loads`, {
        headers,
        data: { facultyId: faculty!.id, subjectId: subject!.id, studentClassId: cls!.id, roomId: room!.id, dayOfWeek, startTime: "17:00", endTime: "18:00", semester: 1, academicYearId: ay.id },
      });
      expect(res.ok()).toBeTruthy();
      return ((await res.json()) as { id: string }).id;
    };
    const dayName = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const ids = [await create(1), await create(3)]; // Mon + Wed, same session

    const listBlocks = async () =>
      (await get<{ id: string; dayOfWeek: number; subjectId: string; startTime: string }[]>(
        `/faculty-loads?studentClassId=${cls!.id}&academicYearId=${ay.id}&semester=1`
      )).filter((l) => l.subjectId === subject!.id && l.startTime === "17:00");

    try {
      await login_(page, "chairman@coe.vantage");
      await page.goto("/scheduler");
      await page.getByRole("combobox", { name: /Student Class|class/i }).first().click();
      await page.getByRole("option", { name: "BS CE 4A" }).first().click();
      await page.getByText("CE101").first().click();

      const form = page.getByRole("group", { name: /Repeats on/ });
      await expect(form).toBeVisible();
      const primary = (await page.getByRole("combobox", { name: "Day of week" }).innerText()).trim().slice(0, 3);
      const other = primary === "Mon" ? "Wed" : "Mon";
      await expect(form.getByLabel(primary)).toBeDisabled();
      await expect(form.getByLabel(other)).toBeChecked();
      await expect(form.getByText(`${other}: saved`)).toBeVisible();

      // Remove the other day, add Friday.
      await form.getByLabel(other).click();
      await expect(form.getByText(new RegExp(`${other}: will be removed`))).toBeVisible();
      await form.getByLabel("Fri").click();
      await expect(form.getByText("Fri: no conflicts, will be added")).toBeVisible();
      await page.getByRole("button", { name: /Update \(2 day changes\)/ }).click();
      await expect(page.getByText(/Block updated: 1 day added, 1 day removed/)).toBeVisible();

      const after = await listBlocks();
      const primaryNum = dayName.indexOf(primary);
      expect(after.map((l) => l.dayOfWeek).sort()).toEqual([primaryNum, 5].sort());
      ids.push(...after.map((l) => l.id));
    } finally {
      for (const l of await listBlocks()) await request.delete(`${API}/faculty-loads/${l.id}`, { headers });
      for (const id of ids) await request.delete(`${API}/faculty-loads/${id}`, { headers });
    }
  });
});

test.describe("subjects page", () => {
  test("opens on the newest curriculum and can limit a subject to rooms", async ({ page, request }) => {
    const login = await request.post(`${API}/auth/login`, { data: { email: "chairman@coe.vantage", password: PASSWORD } });
    const { accessToken } = (await login.json()) as { accessToken: string };
    const headers = { Authorization: `Bearer ${accessToken}` };
    const get = async <T>(path: string) => (await (await request.get(`${API}${path}`, { headers })).json()) as T;

    const curricula = await get<{ id: string; name: string; createdAt: string }[]>("/curriculum");
    const newest = [...curricula].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const subject = (await get<{ id: string; code: string; curriculum?: { name: string } }[]>("/subjects")).find((s) => s.code === "CE101");
    test.skip(!newest || !subject?.curriculum, "needs curricula and the seeded CE101");

    try {
      await login_(page, "chairman@coe.vantage");
      await page.goto("/subjects");
      const filter = page.getByRole("combobox", { name: "Filter subjects by curriculum" });
      await expect(filter).toHaveValue(newest.name);

      // Switch to CE101's curriculum, then restrict it to one room.
      await filter.click();
      await page.getByRole("option", { name: subject!.curriculum!.name, exact: true }).click();
      await page.getByRole("button", { name: "Actions for CE101" }).click();
      await page.getByRole("menuitem", { name: "Set rooms for auto-assign" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Search rooms").fill("CE-202");
      await dialog.getByRole("checkbox").first().check();
      await dialog.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("Rooms saved")).toBeVisible();

      const row = page.getByRole("row").filter({ hasText: "CE101" });
      await expect(row.getByText("CE-202")).toBeVisible();
      const saved = await get<{ name: string }[]>(`/subjects/${subject!.id}/rooms`);
      expect(saved.map((r) => r.name)).toEqual(["CE-202"]);
    } finally {
      await request.put(`${API}/subjects/${subject!.id}/rooms`, { headers, data: { roomIds: [] } });
    }
  });
});
