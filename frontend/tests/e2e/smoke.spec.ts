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
    await expect(dialog.getByRole("heading", { name: "v0.3.5" })).toBeVisible();
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

    await page.getByRole("link", { name: /Faculty load/ }).first().click();
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
    const headings = await page.getByRole("heading", { level: 2 }).allInnerTexts();
    expect(headings.slice(0, 2)).toEqual(["College Workload", "Faculty report"]);
    expect(headings).not.toContain("College workload (Excel)");
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

test.describe("scheduler: availability panels", () => {
  test("the room panel can be reloaded to pick up changes made elsewhere", async ({ page, request }) => {
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

    let createdId: string | null = null;
    try {
      await login_(page, "chairman@coe.vantage");
      await page.goto("/scheduler");
      const reload = page.getByRole("button", { name: "Reload room availability" });
      await expect(reload).toBeDisabled(); // nothing selected yet

      await page.getByPlaceholder(/room/i).first().click();
      await page.getByRole("option", { name: /CE-201/ }).first().click();
      await expect(reload).toBeEnabled();
      await expect(page.getByText("CE101")).toHaveCount(0);

      // Another user adds a block in this room; the panel does not know yet.
      const res = await request.post(`${API}/faculty-loads`, {
        headers,
        data: { facultyId: faculty!.id, subjectId: subject!.id, studentClassId: cls!.id, roomId: room!.id, dayOfWeek: 6, startTime: "17:00", endTime: "18:00", semester: 1, academicYearId: ay.id },
      });
      expect(res.ok()).toBeTruthy();
      createdId = ((await res.json()) as { id: string }).id;

      await reload.click();
      await expect(page.getByText("CE101").first()).toBeVisible();
    } finally {
      if (createdId) await request.delete(`${API}/faculty-loads/${createdId}`, { headers });
    }
  });

  test("the faculty panel has a reload button that needs a faculty first", async ({ page }) => {
    await login_(page, "chairman@coe.vantage");
    await page.goto("/scheduler");
    const reload = page.getByRole("button", { name: "Reload faculty schedule" });
    await expect(reload).toBeVisible();
    await expect(reload).toBeDisabled();
    await page.getByLabel("Select faculty to preview").click();
    await page.getByRole("option").nth(1).click();
    await expect(reload).toBeEnabled();
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/faculty-loads?") && r.url().includes("facultyId=")),
      reload.click(),
    ]);
    expect(response.ok()).toBeTruthy();
  });
});

test.describe("schedules pages: scope by role", () => {
  async function apiToken(request: import("@playwright/test").APIRequestContext, email: string) {
    const res = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
    return ((await res.json()) as { accessToken: string }).accessToken;
  }
  const names = async (request: import("@playwright/test").APIRequestContext, token: string, path: string) =>
    ((await (await request.get(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })).json()) as { name: string }[]).map((x) => x.name);

  for (const email of ["dean@coe.vantage", "secretary@coe.vantage"]) {
    test(`${email} sees every department's faculty and classes without picking a department`, async ({ page, request }) => {
      const chair = await apiToken(request, "chairman@coe.vantage");
      const viewer = await apiToken(request, email);
      const chairFaculty = new Set(await names(request, chair, "/users?role=FACULTY"));
      const allFaculty = await names(request, viewer, "/users?role=FACULTY");
      const foreignFaculty = allFaculty.find((n) => !chairFaculty.has(n));
      const chairClasses = new Set(await names(request, chair, "/student-classes"));
      const foreignClass = (await names(request, viewer, "/student-classes")).find((n) => !chairClasses.has(n));
      test.skip(!foreignFaculty && !foreignClass, "needs data in more than one department");

      await login_(page, email);
      if (foreignFaculty) {
        await page.goto("/schedules/faculty");
        await expect(page.getByRole("combobox", { name: "Department" })).toHaveValue("All departments");
        await page.getByRole("combobox", { name: "Faculty" }).click();
        await expect(page.getByRole("option", { name: foreignFaculty })).toBeVisible();
      }
      if (foreignClass) {
        await page.goto("/schedules/student-class");
        await page.getByRole("combobox", { name: "Class" }).click();
        await expect(page.getByRole("option", { name: foreignClass })).toBeVisible();
      }
    });
  }

  test("a chairman only sees their own department", async ({ page, request }) => {
    const chair = await apiToken(request, "chairman@coe.vantage");
    const dean = await apiToken(request, "dean@coe.vantage");
    const chairFaculty = new Set(await names(request, chair, "/users?role=FACULTY"));
    const foreign = (await names(request, dean, "/users?role=FACULTY")).find((n) => !chairFaculty.has(n));
    test.skip(!foreign, "needs faculty in more than one department");

    await login_(page, "chairman@coe.vantage");
    await page.goto("/schedules/faculty");
    await expect(page.getByRole("combobox", { name: "Department" })).toHaveCount(0); // fixed to their department
    await page.getByRole("combobox", { name: "Faculty" }).click();
    await expect(page.getByRole("option", { name: foreign! })).toHaveCount(0);
  });
});

test.describe("help tips", () => {
  test("the (?) icon explains a section on hover, focus and click, and closes on Escape", async ({ page }) => {
    await login_(page, "admin@coe.vantage");
    await page.goto("/reports");
    const tip = page.getByRole("heading", { name: "College Workload" }).locator("xpath=following-sibling::button");
    await expect(tip).toBeVisible();
    await expect(page.getByRole("tooltip")).toHaveCount(0);

    await tip.hover();
    await expect(page.getByRole("tooltip")).toContainText("Registrar-format Excel forms");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toHaveCount(0);

    await page.mouse.move(0, 0);
    await tip.focus();
    await expect(page.getByRole("tooltip")).toContainText("laboratory units at three times");
    await tip.blur();
    await expect(page.getByRole("tooltip")).toHaveCount(0);

    await tip.click(); // tap/click pins it open
    await page.mouse.move(0, 0);
    await expect(page.getByRole("tooltip")).toBeVisible();
    await page.mouse.click(5, 300);
    await expect(page.getByRole("tooltip")).toHaveCount(0);
  });
});

test.describe("deloading, underload / overload and the faculty view", () => {
  test("deloading lowers the allowed units and the faculty member sees their own state in colour", async ({ page, request }) => {
    const adminLogin = await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } });
    const adminHeaders = { Authorization: `Bearer ${((await adminLogin.json()) as { accessToken: string }).accessToken}` };
    const get = async <T>(path: string, headers = adminHeaders) => (await (await request.get(`${API}${path}`, { headers })).json()) as T;

    const ay = await get<{ id: string }>("/academic-years/active");
    const users = await get<{ id: string; email: string; maxUnits: number | null }[]>("/users?role=FACULTY");
    const faculty = users.find((u) => u.email === "faculty1@coe.vantage");
    test.skip(!faculty, "needs faculty1@coe.vantage");
    const originalMax = faculty!.maxUnits;

    try {
      const patch = await request.patch(`${API}/users/${faculty!.id}`, { headers: adminHeaders, data: { maxUnits: 18 } });
      expect(patch.ok()).toBeTruthy();
      const put = await request.put(`${API}/deloadings/user/${faculty!.id}`, {
        headers: adminHeaders,
        data: { academicYearId: ay.id, semester: 1, items: [{ description: "Research assignment", units: 6 }] },
      });
      expect(put.ok()).toBeTruthy();

      // the person's own numbers, from their own token
      const own = await request.post(`${API}/auth/login`, { data: { email: "faculty1@coe.vantage", password: PASSWORD } });
      const ownHeaders = { Authorization: `Bearer ${((await own.json()) as { accessToken: string }).accessToken}` };
      const me = await get<{ workload: { effectiveMax: number; deloadTotal: number; state: string; assignedUnits: number } }>(
        `/dashboard/me?academicYearId=${ay.id}&semester=1`,
        ownHeaders
      );
      expect(me.workload.deloadTotal).toBe(6);
      expect(me.workload.effectiveMax).toBe(12);
      const expected = { over: "Overload", under: "Underload", full: "Fully loaded" }[me.workload.state as "over" | "under" | "full"];

      await login_(page, "faculty1@coe.vantage");
      await expect(page.getByRole("heading", { name: "My workload" })).toBeVisible();
      const panel = page.getByRole("region", { name: "My workload" });
      await expect(panel.getByText(expected, { exact: true }).first()).toBeVisible();
      await expect(panel.getByText("Research assignment")).toBeVisible();
      await expect(panel.getByText("Effective maximum")).toBeVisible();
      // a faculty member does not get the college overview
      await expect(page.getByRole("heading", { name: "Term overview" })).toHaveCount(0);
    } finally {
      await request.put(`${API}/deloadings/user/${faculty!.id}`, {
        headers: adminHeaders,
        data: { academicYearId: ay.id, semester: 1, items: [] },
      });
      await request.patch(`${API}/users/${faculty!.id}`, { headers: adminHeaders, data: { maxUnits: originalMax } });
    }
  });

  test("only an admin or the department chairman can edit deloading; dean, secretary and faculty cannot", async ({ request }) => {
    const token = async (email: string) =>
      ((await (await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } })).json()) as { accessToken: string }).accessToken;
    const adminHeaders = { Authorization: `Bearer ${await token("admin@coe.vantage")}` };
    const ay = (await (await request.get(`${API}/academic-years/active`, { headers: adminHeaders })).json()) as { id: string };
    const users = (await (await request.get(`${API}/users?role=FACULTY`, { headers: adminHeaders })).json()) as { id: string; email: string }[];
    const target = users.find((u) => u.email === "faculty1@coe.vantage");
    test.skip(!target, "needs faculty1@coe.vantage");
    const body = { academicYearId: ay.id, semester: 1, items: [] };
    for (const email of ["dean@coe.vantage", "secretary@coe.vantage"]) {
      const res = await request.put(`${API}/deloadings/user/${target!.id}`, { headers: { Authorization: `Bearer ${await token(email)}` }, data: body });
      expect(res.status(), `${email} must not edit deloading`).toBe(403);
      const read = await request.get(`${API}/deloadings?academicYearId=${ay.id}&semester=1`, { headers: { Authorization: `Bearer ${await token(email)}` } });
      expect(read.ok()).toBeTruthy();
    }
    // The chairman may edit exactly when this person belongs to their department.
    const chairHeaders = { Authorization: `Bearer ${await token("chairman@coe.vantage")}` };
    const chairList = (await (await request.get(`${API}/users?role=FACULTY`, { headers: chairHeaders })).json()) as { id: string }[];
    const chairEdit = await request.put(`${API}/deloadings/user/${target!.id}`, { headers: chairHeaders, data: body });
    expect(chairEdit.status()).toBe(chairList.some((u) => u.id === target!.id) ? 200 : 403);
    const facultyEdit = await request.put(`${API}/deloadings/user/${target!.id}`, { headers: { Authorization: `Bearer ${await token("faculty1@coe.vantage")}` }, data: body });
    expect(facultyEdit.status()).toBe(403);
  });

  test("the conflicts view opens for the dean and shows the load colours on the workload view", async ({ page }) => {
    await login_(page, "dean@coe.vantage");
    await page.goto("/dashboard/details/conflicts");
    await expect(page.getByRole("heading", { name: "Schedule conflicts" })).toBeVisible();
    await page.goto("/dashboard/details/faculty-workload");
    await expect(page.getByRole("heading", { name: "Faculty workload" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Allowed" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Deloading" })).toBeVisible();
  });
});

test.describe("dashboard export", () => {
  test("exports all metrics as Excel from the dashboard and the filtered rows as CSV from a detail view", async ({ page }) => {
    await login_(page, "dean@coe.vantage");
    const [all] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export all metrics (Excel)" }).click(),
    ]);
    expect(all.suggestedFilename()).toMatch(/^dashboard-.*\.xlsx$/);

    await page.goto("/dashboard/details/faculty-workload?state=under");
    await expect(page.getByRole("heading", { name: "Faculty workload" })).toBeVisible();
    const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export CSV" }).click()]);
    expect(csv.suggestedFilename()).toMatch(/^dashboard-faculty-workload-.*\.csv$/);
    const fs = await import("node:fs");
    const text = fs.readFileSync((await csv.path())!, "utf8");
    expect(text.split("\r\n")[0]).toContain("Allowed units");
    // the filter (underload only) is respected: no overload rows
    expect(text).not.toContain(",Overload");
    expect(text).toContain("Underload");
  });

  test("a faculty member cannot export dashboard metrics", async ({ request }) => {
    const login = await request.post(`${API}/auth/login`, { data: { email: "faculty1@coe.vantage", password: PASSWORD } });
    const { accessToken } = (await login.json()) as { accessToken: string };
    const res = await request.get(`${API}/dashboard/export?metric=conflicts&format=csv`, { headers: { Authorization: `Bearer ${accessToken}` } });
    expect(res.status()).toBe(403);
  });
});
