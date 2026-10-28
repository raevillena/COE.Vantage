import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.E2E_PASSWORD ?? "Test123!";
const API = process.env.E2E_API_URL ?? "http://localhost:4000";

async function browserLogin(browser: import("@playwright/test").Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await login(page, email);
  return page;
}

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
    await expect(dialog.getByRole("heading", { name: "v0.3.9" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "v0.3.8" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "v0.3.7" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "v0.3.6" })).toBeVisible();
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
    await expect(nav.getByRole("link", { name: "Subjects", exact: true })).toBeVisible();
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
    // A regular assignment has 0 deloading units; negative units are refused.
    const zero = await request.put(`${API}/deloadings/user/${target!.id}`, { headers: adminHeaders, data: { ...body, items: [{ description: "Thesis panel", units: 0 }] } });
    expect(zero.status()).toBe(200);
    const negative = await request.put(`${API}/deloadings/user/${target!.id}`, { headers: adminHeaders, data: { ...body, items: [{ description: "Bad", units: -1 }] } });
    expect(negative.status()).toBe(400);
    await request.put(`${API}/deloadings/user/${target!.id}`, { headers: adminHeaders, data: body });
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

test.describe("feedback", () => {
  // 1x1 transparent PNG
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const TITLE = `E2E feedback ${Date.now()}`;

  test("anyone can send feedback with a picture, everyone can read it, only an admin changes it", async ({ browser, request }) => {
    // faculty submits
    const fctx = await browser.newContext();
    const fpage = await fctx.newPage();
    await login(fpage, "faculty1@coe.vantage");
    await fpage.getByRole("link", { name: "Feedback" }).click();
    await expect(fpage.getByRole("heading", { name: "Feedback", exact: true })).toBeVisible();
    await expect(fpage.getByLabel("Picture storage")).toHaveCount(0);
    await fpage.getByRole("button", { name: "New feedback" }).click();
    const dlg = fpage.getByRole("dialog");
    await dlg.getByLabel("Page or section").selectOption("Scheduler");
    await dlg.getByLabel("Title").fill(TITLE);
    await dlg.getByLabel("Details").fill("The room list should show capacity next to the name.");
    await dlg.getByLabel("Choose pictures").setInputFiles({ name: "shot.png", mimeType: "image/png", buffer: PNG });
    await expect(dlg.getByRole("img", { name: /shot/ })).toBeVisible();
    await dlg.getByRole("button", { name: "Send feedback" }).click();
    await expect(fpage.getByRole("heading", { name: TITLE })).toBeVisible();

    // another user (chairman) sees it but has no admin controls
    const cctx = await browser.newContext();
    const cpage = await cctx.newPage();
    await login(cpage, "chairman@coe.vantage");
    await cpage.goto("/feedback");
    await cpage.getByRole("heading", { name: TITLE }).click();
    const cdlg = cpage.getByRole("dialog");
    await expect(cdlg.getByText("The room list should show capacity")).toBeVisible();
    await expect(cdlg.getByRole("img", { name: /Picture 1/ })).toBeVisible();
    await expect(cdlg.getByRole("button", { name: "Archive" })).toHaveCount(0);
    await expect(cdlg.getByLabel("Status")).toHaveCount(0);

    // API: a non-admin cannot change status or delete
    const login1 = await request.post(`${API}/auth/login`, { data: { email: "chairman@coe.vantage", password: PASSWORD } });
    const ctoken = ((await login1.json()) as { accessToken: string }).accessToken;
    const list = (await (await request.get(`${API}/feedback?q=${encodeURIComponent(TITLE)}`, { headers: { Authorization: `Bearer ${ctoken}` } })).json()) as { id: string }[];
    expect(list).toHaveLength(1);
    const id = list[0].id;
    expect((await request.patch(`${API}/feedback/${id}`, { data: { status: "DONE" }, headers: { Authorization: `Bearer ${ctoken}` } })).status()).toBe(403);
    expect((await request.delete(`${API}/feedback/${id}`, { headers: { Authorization: `Bearer ${ctoken}` } })).status()).toBe(403);
    // a non-picture renamed to .png is rejected
    const bad = await request.post(`${API}/feedback`, {
      headers: { Authorization: `Bearer ${ctoken}` },
      multipart: { page: "Reports", type: "BUG", title: "not a picture", description: "text file", images: { name: "x.png", mimeType: "image/png", buffer: Buffer.from("hello world, not an image") } },
    });
    expect(bad.status()).toBe(400);
    await cctx.close();
    await fctx.close();

    // admin: status, note, archive, delete picture, purge, delete
    const actx = await browser.newContext();
    const apage = await actx.newPage();
    await login(apage, "admin@coe.vantage");
    await apage.goto("/feedback");
    await expect(apage.getByLabel("Picture storage")).toBeVisible();
    await apage.getByRole("heading", { name: TITLE }).click();
    const adlg = apage.getByRole("dialog");
    await adlg.getByLabel("Status").selectOption("DONE");
    await adlg.getByLabel("Note for everyone").fill("Added in the next release");
    await adlg.getByRole("button", { name: "Save" }).click();
    await expect(apage.getByText("Saved")).toBeVisible();
    await adlg.getByRole("button", { name: "Archive" }).click();
    await expect(adlg.getByRole("button", { name: "Restore" })).toBeVisible();
    await adlg.getByRole("button", { name: "Close" }).click();
    // archived items leave the default list
    await expect(apage.getByRole("heading", { name: TITLE })).toHaveCount(0);
    await apage.getByLabel("Archive", { exact: true }).selectOption("true");
    await expect(apage.getByRole("heading", { name: TITLE })).toBeVisible();

    // the housekeeping panel counts this picture as purgeable (done + archived, any age)
    await apage.getByLabel("Older than").selectOption("0");
    await expect(apage.getByRole("button", { name: /Delete \d+ pictures? \(/ })).toBeEnabled();
    await apage.getByRole("button", { name: /Delete \d+ pictures? \(/ }).click();
    await apage.getByRole("button", { name: "Yes, delete" }).click();
    await expect(apage.getByText(/Deleted \d+ pictures?/)).toBeVisible();
    // text and note survive; the picture is gone
    await apage.getByRole("heading", { name: TITLE }).click();
    await expect(apage.getByRole("dialog").getByText("No pictures attached.")).toBeVisible();
    await expect(apage.getByRole("dialog").getByLabel("Note for everyone")).toHaveValue("Added in the next release");
    await apage.getByRole("button", { name: "Delete feedback" }).click();
    await apage.getByRole("button", { name: "Yes, delete" }).click();
    await expect(apage.getByRole("heading", { name: TITLE })).toHaveCount(0);
    await actx.close();
  });
});

test.describe("faculty scope in schedules and reports", () => {
  async function token(request: import("@playwright/test").APIRequestContext, email: string) {
    const r = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
    return ((await r.json()) as { accessToken: string }).accessToken;
  }
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  test("a faculty member has no faculty schedule page and sees only their own name, classes and rooms", async ({ page, request }) => {
    await login(page, "faculty1@coe.vantage");
    await expect(page.getByRole("link", { name: "Class schedule", exact: true })).toBeVisible();
    await expect(page.locator('a[href="/schedules/faculty"]')).toHaveCount(0);
    await page.goto("/schedules/faculty");
    await page.waitForURL("**/dashboard");

    const ft = await token(request, "faculty1@coe.vantage");
    const at = await token(request, "admin@coe.vantage");
    const years = (await (await request.get(`${API}/academic-years/for-schedules`, { headers: auth(ft) })).json()) as { id: string; isActive: boolean }[];
    const yearId = (years.find((y) => y.isActive) ?? years[0]).id;

    // people list: only themselves
    const people = (await (await request.get(`${API}/users?role=FACULTY&role=CHAIRMAN&role=DEAN`, { headers: auth(ft) })).json()) as { id: string; email: string }[];
    expect(people.map((p) => p.email)).toEqual(["faculty1@coe.vantage"]);
    const me = people[0].id;

    // another person's report is refused, their own is allowed
    const everyone = (await (await request.get(`${API}/users?role=FACULTY&role=CHAIRMAN`, { headers: auth(at) })).json()) as { id: string }[];
    const other = everyone.find((u) => u.id !== me)!;
    expect((await request.get(`${API}/reports/faculty/${other.id}/data?academicYearId=${yearId}&semester=1`, { headers: auth(ft) })).status()).toBe(403);
    expect((await request.get(`${API}/reports/faculty/${other.id}/nota?academicYearId=${yearId}&semester=1`, { headers: auth(ft) })).status()).toBe(403);
    expect((await request.get(`${API}/reports/faculty/${me}/data?academicYearId=${yearId}&semester=1`, { headers: auth(ft) })).status()).toBe(200);

    // classes and rooms: only where they teach
    // every term, so the case where the faculty member does teach is covered when the data has one
    for (const { yr, sem } of years.flatMap((y) => [1, 2].map((n) => ({ yr: y.id, sem: n })))) {
      const yearId = yr;
      const mine = (await (await request.get(`${API}/reports/my/classes?academicYearId=${yearId}&semester=${sem}`, { headers: auth(ft) })).json()) as { id: string }[];
      const allClasses = (await (await request.get(`${API}/student-classes`, { headers: auth(at) })).json()) as { id: string }[];
      for (const c of mine) {
        expect((await request.get(`${API}/reports/student-class/${c.id}/data?academicYearId=${yearId}&semester=${sem}`, { headers: auth(ft) })).status()).toBe(200);
      }
      const notMine = allClasses.find((c) => !mine.some((m) => m.id === c.id));
      if (notMine) {
        expect((await request.get(`${API}/reports/student-class/${notMine.id}/data?academicYearId=${yearId}&semester=${sem}`, { headers: auth(ft) })).status()).toBe(403);
      }
      const myRooms = (await (await request.get(`${API}/reports/my/rooms?academicYearId=${yearId}&semester=${sem}`, { headers: auth(ft) })).json()) as { id: string }[];
      const allRooms = (await (await request.get(`${API}/rooms`, { headers: auth(at) })).json()) as { id: string }[];
      for (const r of myRooms) {
        expect((await request.get(`${API}/reports/room/${r.id}/data?academicYearId=${yearId}&semester=${sem}`, { headers: auth(ft) })).status()).toBe(200);
      }
      const notMyRoom = allRooms.find((r) => !myRooms.some((m) => m.id === r.id));
      if (notMyRoom) {
        expect((await request.get(`${API}/reports/room/${notMyRoom.id}/data?academicYearId=${yearId}&semester=${sem}`, { headers: auth(ft) })).status()).toBe(403);
      }
    }
  });

  test("faculty pages and reports load for a faculty member, and the chairman is limited to their department", async ({ page, request }) => {
    await login(page, "faculty1@coe.vantage");
    await page.goto("/schedules/student-class");
    await expect(page.getByRole("heading", { name: "Student Class Schedule" })).toBeVisible();
    await expect(page.getByText(/Select a class\.|You have no classes in this term\./)).toBeVisible();
    await page.goto("/schedules/rooms");
    await expect(page.getByRole("heading", { name: "Room Availability" })).toBeVisible();
    await expect(page.getByText(/Select a room\.|You have no rooms in this term\./)).toBeVisible();
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
    await expect(page.getByText("Select academic year and faculty to view schedule.").or(page.getByText(/Total units/)).or(page.getByText("No schedule for this faculty"))).toBeVisible();

    const ct = await token(request, "chairman@coe.vantage");
    const at = await token(request, "admin@coe.vantage");
    const years = (await (await request.get(`${API}/academic-years/for-schedules`, { headers: auth(ct) })).json()) as { id: string; isActive: boolean }[];
    const yearId = (years.find((y) => y.isActive) ?? years[0]).id;
    const chairman = (await (await request.get(`${API}/users?role=CHAIRMAN`, { headers: auth(at) })).json()) as { id: string; email: string; departmentId: string | null }[];
    const myDept = chairman.find((u) => u.email === "chairman@coe.vantage")!.departmentId;
    const all = (await (await request.get(`${API}/users?role=FACULTY&role=CHAIRMAN`, { headers: auth(at) })).json()) as { id: string; departmentId: string | null }[];
    const foreign = all.find((u) => u.departmentId && u.departmentId !== myDept);
    if (foreign) {
      expect((await request.get(`${API}/reports/faculty/${foreign.id}/data?academicYearId=${yearId}&semester=1`, { headers: auth(ct) })).status()).toBe(403);
    }
    const dt = await token(request, "dean@coe.vantage");
    if (foreign) {
      expect((await request.get(`${API}/reports/faculty/${foreign.id}/data?academicYearId=${yearId}&semester=1`, { headers: auth(dt) })).status()).toBe(200);
    }
  });
});

test.describe("current term", () => {
  test("the college secretary sets the current term and the filters open on it", async ({ page, request }) => {
    const token = async (email: string) =>
      ((await (await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } })).json()) as { accessToken: string }).accessToken;
    const admin = { Authorization: `Bearer ${await token("admin@coe.vantage")}` };
    const original = (await (await request.get(`${API}/academic-years/active`, { headers: admin })).json()) as { id: string; currentSemester: number } | null;
    test.skip(!original, "needs an active academic year");
    // only admin and college secretary may set it
    const faculty = { Authorization: `Bearer ${await token("faculty1@coe.vantage")}` };
    expect((await request.put(`${API}/academic-years/current-term`, { headers: faculty, data: { academicYearId: original!.id, semester: 2 } })).status()).toBe(403);
    expect((await request.put(`${API}/academic-years/current-term`, { headers: admin, data: { academicYearId: original!.id, semester: 4 } })).status()).toBe(400);

    try {
      await login(page, "secretary@coe.vantage");
      await page.getByRole("link", { name: "Academic years", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Academic Years" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Add Academic Year" })).toBeVisible(); // the college secretary adds academic years too
      await page.getByLabel("Semester", { exact: true }).selectOption("2");
      await page.getByRole("button", { name: "Set as current term" }).click();
      await expect(page.getByText("Current term saved")).toBeVisible();

      // filters now open on the 2nd semester
      await page.goto("/schedules/student-class");
      await expect(page.getByRole("combobox", { name: "Semester" })).toHaveText(/2/);
      await page.goto("/reports");
      await expect(page.getByRole("combobox", { name: "Semester" })).toHaveText(/2/);

      // Mid Year is a valid current semester too
      await request.put(`${API}/academic-years/current-term`, { headers: admin, data: { academicYearId: original!.id, semester: 3 } });
      await page.goto("/schedules/rooms");
      await expect(page.getByRole("combobox", { name: "Semester" })).toHaveText(/Mid Year/);
    } finally {
      await request.put(`${API}/academic-years/current-term`, { headers: admin, data: { academicYearId: original!.id, semester: original!.currentSemester ?? 1 } });
    }
  });
});

test.describe("scheduler time inputs", () => {
  test("warns when the end time is before the start (12 AM instead of 12 PM) and the time picker follows dark mode", async ({ page }) => {
    await login_(page, "chairman@coe.vantage");
    await page.goto("/scheduler");
    await page.getByRole("button", { name: /Add load/ }).click();
    const dialog = page.getByRole("dialog");
    const [start, end] = [dialog.locator('input[type="time"]').nth(0), dialog.locator('input[type="time"]').nth(1)];
    await start.fill("09:00");
    await end.fill("10:00");
    await expect(dialog.getByText(/negative length/)).toHaveCount(0);

    // 12:00 AM typed for 12:00 PM
    await end.fill("00:00");
    const warning = dialog.getByRole("alert").filter({ hasText: "negative length" });
    await expect(warning).toContainText("12:00 AM");
    await expect(warning).toContainText("9:00 AM");
    await warning.getByRole("button", { name: "Set the end time to 12:00 PM" }).click();
    await expect(end).toHaveValue("12:00");
    await expect(dialog.getByText(/negative length/)).toHaveCount(0);

    // same time on both ends is also flagged
    await end.fill("09:00");
    await expect(dialog.getByRole("alert").filter({ hasText: "no length" })).toBeVisible();

    // native pickers follow the theme
    expect(await start.evaluate((el) => getComputedStyle(el).colorScheme)).toBe("light");
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    expect(await start.evaluate((el) => getComputedStyle(el).colorScheme)).toBe("dark");
  });
});

test.describe("GE schedule import", () => {
  const HEADER = "Program\tYear\tSection\tCourse Code\tCourse Title\tNo. of Units\t\tCourse Title\tNo. of Units\tTime\tDay\tBldg & Room\tFaculty";
  const SUB = "\t\t\t\t\tLec\tLab";

  test("pastes a GE sheet, matches by code and by drag, resolves a conflict and saves", async ({ page, request }) => {
    const token = ((await (await request.post(`${API}/auth/login`, { data: { email: "chairman@coe.vantage", password: PASSWORD } })).json()) as { accessToken: string }).accessToken;
    const headers = { Authorization: `Bearer ${token}` };
    const get = async <T>(path: string) => (await (await request.get(`${API}${path}`, { headers })).json()) as T;
    const ay = await get<{ id: string; currentSemester: number }>("/academic-years/active");
    const semester = ay.currentSemester === 2 ? 2 : 1;

    type Subj = { id: string; code: string; codeKey: string; name: string };
    const classes = await get<{ id: string; name: string }[]>("/student-classes");
    let target: { id: string; name: string } | null = null;
    let subjects: Subj[] = [];
    for (const c of classes) {
      const r = await get<{ subjects: Subj[] }>(`/ge-import/class-subjects?studentClassId=${c.id}&academicYearId=${ay.id}&semester=${semester}`);
      if (r.subjects.length >= 2) {
        target = c;
        subjects = r.subjects;
        break;
      }
    }
    test.skip(!target, "needs a class with two subjects in the current term");
    const [first, second] = subjects;

    const sheet = [
      HEADER,
      SUB,
      `TESTPROG\t1\tZ\t${first.code}\t${first.name}\t3\t0\t${first.name}\t3\t05:00-06:00\tS\tCAB 1\tGE Prof A`,
      `TESTPROG\t1\tZ\tZZZ 99\tMystery GE\t3\t0\tMystery GE\t3\t05:30-06:30\tS\tCAB 2\tGE Prof B`,
      `TESTPROG\t1\tZ\tABE 10\t\t\t\tSurveying Lab\t1\t07:30-10:30\tTh\tCOE\tCOE Faculty`,
    ].join("\n");

    const createdIds: string[] = [];
    try {
      await login_(page, "chairman@coe.vantage");
      await page.goto("/scheduler");
      await page.getByRole("button", { name: /Import GE/ }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Class to import into").selectOption(target!.id);
      await expect(dialog.getByText("Checking…")).toHaveCount(0);
      await dialog.getByRole("radio", { name: /Custom/ }).check();
      await dialog.getByLabel("Pasted schedule rows").fill(sheet);
      await dialog.getByRole("button", { name: "Read schedule" }).click();
      await expect(dialog.getByText(/Read 3 rows in 1 sections/)).toBeVisible();
      await dialog.getByLabel(/Section in the file/).selectOption({ label: "TESTPROG 1-Z (3 rows)" });
      await expect(dialog.getByText("2 rows can be scheduled.")).toBeVisible();
      await expect(dialog.getByText(/rows by the college's own faculty/)).toBeVisible();
      await dialog.getByRole("button", { name: "Next: match subjects" }).click();

      // the first row matched by code; the unknown one is dragged onto the second subject
      await expect(dialog.getByText(/1 matched by course code, 1 to match/)).toBeVisible();
      await dialog.evaluate((el) => {
        el.scrollTop = 0; // a drag near the top edge would auto-scroll the dialog
      });
      const handle = dialog.getByRole("button", { name: "Drag ZZZ 99 onto a subject" });
      const targetBox = dialog.getByRole("region", { name: "Subjects of this class" }).getByRole("listitem").filter({ hasText: second.code }).first();
      const from = await handle.boundingBox();
      const to = await targetBox.boundingBox();
      await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
      await page.mouse.down();
      await page.mouse.move(from!.x + from!.width / 2 + 10, from!.y + from!.height / 2 + 10, { steps: 3 });
      for (let i = 1; i <= 12; i += 1) {
        await page.mouse.move(from!.x + 10 + ((to!.x + 20 - from!.x - 10) * i) / 12, from!.y + 10 + ((to!.y + 10 - from!.y - 10) * i) / 12);
        await page.waitForTimeout(30);
      }
      await page.waitForTimeout(150);
      await page.mouse.up();
      await expect(dialog.getByText(/1 matched by course code, 0 to match/)).toBeVisible();
      await page.waitForTimeout(250); // dnd-kit swallows a click that follows a drop immediately
      await dialog.getByRole("button", { name: /Next: review \(2 matched\)/ }).click();

      // the two Saturday blocks overlap: blocking until one time is changed
      await expect(dialog.getByText(/Overlaps another imported block/).first()).toBeVisible();
      const add = dialog.getByRole("button", { name: /^Add \d+ blocks?$/ });
      await expect(add).toBeDisabled();
      await dialog.getByLabel(`Start for ${second.code} Sat`).fill("18:30");
      await dialog.getByLabel(`End for ${second.code} Sat`).fill("19:30");
      await expect(dialog.getByText("No conflicts to resolve")).toBeVisible();
      const reviewed = dialog.getByLabel(/I have reviewed the warnings/);
      if (await reviewed.count()) await reviewed.check();
      await expect(add).toBeEnabled();
      await add.click();
      await expect(dialog.getByText(/Added 2 blocks to/)).toBeVisible();

      const loads = await get<{ id: string; facultyDisplayName: string | null; startTime: string }[]>(
        `/faculty-loads?studentClassId=${target!.id}&academicYearId=${ay.id}&semester=${semester}`
      );
      const mine = loads.filter((l) => l.facultyDisplayName === "GE Prof A" || l.facultyDisplayName === "GE Prof B");
      createdIds.push(...mine.map((l) => l.id));
      expect(mine.map((l) => l.startTime).sort()).toEqual(["17:00", "18:30"]);

      // a second import of the same sheet finds the first block already scheduled
      const again = await request.post(`${API}/ge-import/preview`, {
        headers,
        data: {
          studentClassId: target!.id,
          academicYearId: ay.id,
          semester,
          blocks: [{ key: "a", subjectId: first.id, dayOfWeek: 6, startTime: "17:00", endTime: "18:00", roomDisplayName: "CAB 1", facultyDisplayName: "GE Prof A" }],
        },
      });
      expect(((await again.json()) as { blocks: { state: string }[] }).blocks[0].state).toBe("exists");
    } finally {
      for (const id of createdIds) await request.delete(`${API}/faculty-loads/${id}`, { headers });
    }
  });

  test("import endpoints: the chairman imports, the college secretary keeps the college sheet, others have no access", async ({ request }) => {
    const tok = async (email: string) =>
      ((await (await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } })).json()) as { accessToken: string }).accessToken;
    const as = async (email: string) => ({ Authorization: `Bearer ${await tok(email)}` });
    for (const email of ["faculty1@coe.vantage", "dean@coe.vantage"]) {
      expect((await request.post(`${API}/ge-import/parse`, { headers: await as(email), data: { text: "x" } })).status(), email).toBe(403);
    }
    const secretary = await as("secretary@coe.vantage");
    // the secretary may read a sheet, but scheduling into a class belongs to the chairman
    expect((await request.post(`${API}/ge-import/parse`, { headers: secretary, data: { text: "no header" } })).status()).toBe(400);
    const zero = "00000000-0000-4000-8000-000000000000";
    expect((await request.post(`${API}/ge-import/preview`, { headers: secretary, data: { studentClassId: zero, academicYearId: zero, semester: 1, blocks: [] } })).status()).toBe(403);
    // and the chairman cannot replace the college sheet
    expect((await request.put(`${API}/ge-import/college`, { headers: await as("chairman@coe.vantage"), data: { academicYearId: zero, semester: 1, text: "x" } })).status()).toBe(403);
  });

  test("the college secretary adds the college GE sheet and the chairman imports from it", async ({ page, request }) => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const tsv = path.resolve(process.cwd(), "..", "GE subjects.txt");
    test.skip(!fs.existsSync(tsv), "needs the sample sheet in the repository root");
    const tok = async (email: string) =>
      ((await (await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } })).json()) as { accessToken: string }).accessToken;
    const sec = { Authorization: `Bearer ${await tok("secretary@coe.vantage")}` };
    const ay = (await (await request.get(`${API}/academic-years/active`, { headers: sec })).json()) as { id: string; currentSemester: number };
    const semester = ay.currentSemester === 2 ? 2 : 1;
    const before = (await (await request.get(`${API}/ge-import/college?academicYearId=${ay.id}&semester=${semester}`, { headers: sec })).json()) as { exists: boolean };
    test.skip(before.exists, "a college GE sheet is already saved for the current term");

    try {
      await login_(page, "secretary@coe.vantage");
      await page.getByRole("link", { name: "GE subjects", exact: true }).click();
      await expect(page.getByRole("heading", { name: "GE subjects" })).toBeVisible();
      await expect(page.getByText(/Nothing is saved for this term yet/)).toBeVisible();
      await page.getByLabel("Pasted GE sheet").fill(fs.readFileSync(tsv, "utf8"));
      await page.getByRole("button", { name: "Check the sheet" }).click();
      await expect(page.getByText("Read 181 rows in 45 sections.")).toBeVisible();
      await page.getByRole("button", { name: /^Save for / }).click();
      await expect(page.getByText(/181 rows from Pasted rows/)).toBeVisible();
      await page.getByLabel("Program").selectOption("BSCE");
      await expect(page.getByText(/rows$/).first()).toBeVisible();
      await expect(page.getByRole("cell", { name: /^BSCE 1-A$/ }).first()).toBeVisible();

      // the chairman gets it as the default source in the scheduler
      const chairman = await browserLogin(page.context().browser()!, "chairman@coe.vantage");
      await chairman.goto("/scheduler");
      await chairman.getByRole("button", { name: /Import GE/ }).click();
      const dialog = chairman.getByRole("dialog");
      await expect(dialog.getByRole("radio", { name: /College GE schedule/ })).toBeChecked();
      await expect(dialog.getByText(/181 rows added by/)).toBeVisible();
      await expect(dialog.getByText("Using 181 rows in 45 sections.")).toBeVisible();
      await dialog.getByRole("radio", { name: /Custom/ }).check();
      await expect(dialog.getByLabel("Pasted schedule rows")).toBeVisible();
      await chairman.context().close();
    } finally {
      await request.delete(`${API}/ge-import/college?academicYearId=${ay.id}&semester=${semester}`, { headers: sec });
    }
  });

  test("the college secretary creates academic years and manages scheduling rules; deleting stays with the admin", async ({ page, request }) => {
    const tok = async (email: string) =>
      ((await (await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } })).json()) as { accessToken: string }).accessToken;
    const sec = { Authorization: `Bearer ${await tok("secretary@coe.vantage")}` };
    const admin = { Authorization: `Bearer ${await tok("admin@coe.vantage")}` };
    const created = await request.post(`${API}/academic-years`, { headers: sec, data: { name: "E2E 2098-2099", isActive: false } });
    expect(created.status()).toBe(201);
    const id = ((await created.json()) as { id: string }).id;
    try {
      expect((await request.patch(`${API}/academic-years/${id}`, { headers: sec, data: { name: "E2E 2098-2099b" } })).status()).toBe(200);
      expect((await request.delete(`${API}/academic-years/${id}`, { headers: sec })).status()).toBe(403);

      const rules = await request.post(`${API}/scheduling-rule-sets`, {
        headers: sec,
        data: { name: "E2E rules", description: null, config: { workStartMinutes: 420, workEndMinutes: 1080, lunchStartMinutes: 720, lunchEndMinutes: 780, slotStepMinutes: 30, avoidLunchSpan: true, preferMwfFor3UnitLecture: true, preferTthFor3UnitLecture: false, maxBlockMinutes: 180 } },
      });
      expect(rules.status()).toBe(201);
      expect((await request.delete(`${API}/scheduling-rule-sets/${((await rules.json()) as { id: string }).id}`, { headers: sec })).status()).toBe(204);

      await login_(page, "secretary@coe.vantage");
      await page.getByRole("link", { name: "Academic years", exact: true }).click();
      await expect(page.getByRole("button", { name: "Add Academic Year" })).toBeVisible();
      await expect(page.getByRole("checkbox", { name: /^Select / })).toHaveCount(0);
      await page.getByRole("link", { name: "Scheduling rules", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Scheduling rules", exact: true })).toBeVisible();
    } finally {
      await request.delete(`${API}/academic-years/${id}`, { headers: admin });
      await request.delete(`${API}/academic-years/trash/${id}`, { headers: admin });
    }
  });
});

test.describe("GE sheet parser", () => {
  test("reads the registrar sample as a text file and as pasted text", async ({ request }) => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dir = path.resolve(process.cwd(), "..");
    const tsv = path.join(dir, "GE subjects.txt");
    const csv = path.join(dir, "Batac-Currimao_GE-Course-Offerings_2nd-sem_AY-2026-2027.xlsx - COE.csv");
    test.skip(!fs.existsSync(tsv) || !fs.existsSync(csv), "needs the sample sheets in the repository root");
    const t = ((await (await request.post(`${API}/auth/login`, { data: { email: "chairman@coe.vantage", password: PASSWORD } })).json()) as { accessToken: string }).accessToken;
    const headers = { Authorization: `Bearer ${t}` };
    type Parsed = { rows: { code: string; codeKey: string; days: number[]; startTime: string; endTime: string; coeFaculty: boolean; problems: string[] }[]; groups: unknown[] };
    for (const file of [tsv, csv]) {
      const res = await request.post(`${API}/ge-import/parse`, { headers, multipart: { file: { name: path.basename(file), mimeType: "text/plain", buffer: fs.readFileSync(file) } } });
      expect(res.status()).toBe(200);
      const parsed = (await res.json()) as Parsed;
      expect(parsed.rows).toHaveLength(181);
      expect(parsed.groups).toHaveLength(45);
      expect(parsed.rows.filter((r) => r.problems.length > 0)).toHaveLength(0);
      const phy = parsed.rows.find((r) => r.codeKey === "PHY10")!;
      expect(phy.days).toEqual([1, 3, 5]);
      expect([phy.startTime, phy.endTime]).toEqual(["07:00", "08:00"]); // 7 AM, no AM/PM on the sheet
      const afternoon = parsed.rows.find((r) => r.codeKey === "ENGL01")!;
      expect([afternoon.startTime, afternoon.endTime]).toEqual(["13:00", "14:30"]); // 1:00 PM
      expect(parsed.rows.filter((r) => r.coeFaculty).length).toBeGreaterThan(0);
    }
    const bad = await request.post(`${API}/ge-import/parse`, { headers, data: { text: "no header here" } });
    expect(bad.status()).toBe(400);
  });
});

test.describe("splitting a repeated subject", () => {
  test("a co-instructor joins every repeat day and another session starts on a free day", async ({ page, request }) => {
    const token = ((await (await request.post(`${API}/auth/login`, { data: { email: "chairman@coe.vantage", password: PASSWORD } })).json()) as { accessToken: string }).accessToken;
    const headers = { Authorization: `Bearer ${token}` };
    const get = async <T,>(path: string) => (await (await request.get(`${API}${path}`, { headers })).json()) as T;
    const ay = await get<{ id: string }>("/academic-years/active");
    const faculty = (await get<{ id: string; name: string }[]>("/users?role=FACULTY")).find((u) => u.name.includes("Maria Santos"));
    const coFaculty = (await get<{ id: string; name: string }[]>("/users?role=FACULTY")).find((u) => u.name.includes("Revilla"));
    const cls = (await get<{ id: string; name: string }[]>("/student-classes")).find((c) => c.name === "BS CE 4A");
    const subject = (await get<{ id: string; code: string }[]>("/subjects")).find((s) => s.code === "CE101");
    const room = (await get<{ id: string; name: string }[]>("/rooms")).find((r) => r.name === "CE-201");
    test.skip(!faculty || !coFaculty || !cls || !subject || !room, "needs the seeded CE data");
    type Load = { id: string; facultyId: string | null; dayOfWeek: number; startTime: string; subject: { code: string } };
    const loadsOf = () => get<Load[]>(`/faculty-loads?studentClassId=${cls!.id}&academicYearId=${ay.id}&semester=1`);

    try {
      let slot = "";
      for (const hr of [10, 11, 13, 14, 15, 16, 17, 18]) {
        const startTime = `${String(hr).padStart(2, "0")}:00`;
        const made: string[] = [];
        for (const dayOfWeek of [1, 3, 5]) {
          const r = await request.post(`${API}/faculty-loads`, {
            headers,
            data: { facultyId: faculty!.id, subjectId: subject!.id, studentClassId: cls!.id, roomId: room!.id, dayOfWeek, startTime, endTime: `${String(hr + 1).padStart(2, "0")}:00`, semester: 1, academicYearId: ay.id },
          });
          if (r.status() === 201) made.push(((await r.json()) as { id: string }).id);
        }
        if (made.length === 3) {
          slot = startTime;
          break;
        }
        for (const id of made) await request.delete(`${API}/faculty-loads/${id}`, { headers });
      }
      test.skip(!slot, "needs a free slot for the faculty on Mon, Wed and Fri");

      await login_(page, "chairman@coe.vantage");
      await page.goto("/scheduler");
      await page.getByText("Select class").first().click();
      await page.getByRole("option", { name: "BS CE 4A" }).click();
      await page.getByText(/D\. Santos/).first().click({ force: true });

      // split: the co-instructor takes this block and the saved repeat days too
      await page.getByRole("button", { name: "Add co-instructor" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText("Also add the co-instructor on")).toBeVisible();
      await expect(dialog.getByRole("checkbox", { name: "Wed" })).toBeChecked();
      await expect(dialog.getByRole("checkbox", { name: "Fri" })).toBeChecked();
      await dialog.getByLabel("Co-instructor faculty").click();
      await page.getByRole("option", { name: /Revilla/ }).click();
      const addCo = dialog.getByRole("button", { name: "Add co-instructor" });
      await expect(addCo).toBeEnabled();
      await addCo.click();
      await expect(page.getByText(/Co-instructor added on Mon and on Wed, Fri/)).toBeVisible();
      const afterSplit = await loadsOf();
      expect(afterSplit.filter((l) => l.facultyId === coFaculty!.id && l.subject.code === "CE101").map((l) => l.dayOfWeek).sort()).toEqual([1, 3, 5]);

      // Split Class: same day, time and room, a different instructor is required, and both blocks are labelled
      await page.getByText(/D\. Santos/).first().click({ force: true });
      await page.getByRole("button", { name: "Split Class" }).click();
      await expect(page.getByRole("note").filter({ hasText: "Split Class." })).toBeVisible();
      await expect(page.getByLabel("Day of week").first()).toContainText("Mon");
      await expect(page.locator('input[type="time"]').first()).toHaveValue(slot);

      const save = page.getByRole("button", { name: /^Save/ });
      await page.getByText("Select faculty").first().click();
      await page.getByRole("option", { name: /Santos/ }).first().click();
      await expect(page.getByText(/same instructor as the original/)).toBeVisible();
      await expect(save).toBeDisabled();

      await page.locator("label", { hasText: /^Faculty$/ }).first().locator("xpath=following-sibling::*[1]").click();
      await page.getByRole("option", { name: /Calaro/ }).first().click();
      await expect(page.getByText(/same instructor as the original/)).toHaveCount(0);
      await expect(page.getByText("No conflicts. You can save.")).toBeVisible();
      await save.click();
      await expect(page.getByText(/Load added|1 block added/).first()).toBeVisible();
      const afterSession = await loadsOf();
      expect(afterSession.filter((l) => l.subject.code === "CE101").length).toBe(afterSplit.filter((l) => l.subject.code === "CE101").length + 1);
      const labelled = afterSession.filter((l) => l.subject.code === "CE101" && (l as unknown as { isSplit: boolean }).isSplit);
      // the splitting instructor's block and the original instructor's blocks (all repeat days) carry the label
      expect(labelled.length).toBeGreaterThanOrEqual(2);
      await expect(page.getByText("Split", { exact: true }).first()).toBeVisible();
    } finally {
      for (const l of await loadsOf()) if (l.subject.code === "CE101") await request.delete(`${API}/faculty-loads/${l.id}`, { headers });
    }
  });
});

test.describe("split rules", () => {
  test("a split needs a different instructor, may use another time, still cannot clash with other subjects, and loses its label when undone", async ({ request }) => {
    const token = ((await (await request.post(`${API}/auth/login`, { data: { email: "chairman@coe.vantage", password: PASSWORD } })).json()) as { accessToken: string }).accessToken;
    const headers = { Authorization: `Bearer ${token}` };
    const get = async <T,>(path: string) => (await (await request.get(`${API}${path}`, { headers })).json()) as T;
    const ay = await get<{ id: string }>("/academic-years/active");
    const users = await get<{ id: string; name: string }[]>("/users?role=FACULTY");
    const [fa, fb, fc] = ["Maria Santos", "Revilla", "Calaro"].map((n) => users.find((u) => u.name.includes(n)));
    const cls = (await get<{ id: string; name: string }[]>("/student-classes")).find((c) => c.name === "BS CE 4A");
    const subjects = await get<{ id: string; code: string }[]>("/subjects");
    const [s1, s2] = [subjects.find((s) => s.code === "CE101"), subjects.find((s) => s.code === "CE401")];
    const rooms = await get<{ id: string; name: string }[]>("/rooms");
    const [r1, r2] = [rooms.find((r) => r.name === "CE-201"), rooms.find((r) => r.name !== "CE-201")];
    test.skip(!fa || !fb || !fc || !cls || !s1 || !s2 || !r1 || !r2, "needs the seeded CE data");
    const base = { studentClassId: cls!.id, semester: 1, academicYearId: ay.id };
    const created: string[] = [];
    const add = async (data: Record<string, unknown>) => {
      const r = await request.post(`${API}/faculty-loads`, { headers, data: { ...base, ...data } });
      if (r.status() === 201) created.push(((await r.json()) as { id: string }).id);
      return r;
    };
    try {
      const original = await add({ subjectId: s1!.id, facultyId: fa!.id, roomId: r1!.id, dayOfWeek: 2, startTime: "16:00", endTime: "17:00" });
      test.skip(original.status() !== 201, "needs a free Tuesday 4 PM slot");
      const originalId = ((await original.json()) as { id: string }).id;
      const split = (over: Record<string, unknown>) => ({ subjectId: s1!.id, dayOfWeek: 2, startTime: "16:00", endTime: "17:00", splitOfLoadId: originalId, ...over });

      // same instructor: refused. Team teaching and split with another instructor in the same room and time: fine
      expect((await add(split({ facultyId: fa!.id, roomId: r2!.id }))).status()).toBe(400);
      expect((await add(split({ facultyId: fb!.id, roomId: r1!.id }))).status()).toBe(201);
      // another time, overlapping its sibling: fine in another room (the split shares the class), not in the same room
      expect((await add(split({ facultyId: fc!.id, roomId: r2!.id, startTime: "16:30", endTime: "17:30" }))).status()).toBe(201);
      expect((await add(split({ facultyId: fc!.id, roomId: r1!.id, startTime: "16:30", endTime: "17:30" }))).status()).toBe(400);
      // a different subject at that time is still a clash for the class, split or not
      expect((await add(split({ subjectId: s2!.id, facultyId: fc!.id, roomId: r2!.id, startTime: "16:15", endTime: "16:45" }))).status()).toBe(400);

      const flags = async () => (await get<{ id: string; isSplit: boolean }[]>(`/faculty-loads?studentClassId=${cls!.id}&academicYearId=${ay.id}&semester=1`)).filter((l) => created.includes(l.id));
      expect((await flags()).every((l) => l.isSplit)).toBe(true);
      // undo the splits: with one instructor left the label goes
      for (const id of created.slice(1)) await request.delete(`${API}/faculty-loads/${id}`, { headers });
      created.splice(1);
      expect((await flags()).every((l) => !l.isSplit)).toBe(true);
    } finally {
      for (const id of created) await request.delete(`${API}/faculty-loads/${id}`, { headers });
    }
  });
});

test.describe("assignment panel day and time", () => {
  test("after picking a faculty the day and times can still be changed", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 1500 });
    await login_(page, "chairman@coe.vantage");
    await page.goto("/scheduler");
    await page.getByText("Select class").first().click();
    await page.getByRole("option", { name: "BS CE 4A" }).click();
    await page.waitForTimeout(800);

    // drag a subject out of the tree onto the grid: a new assignment starts in the panel
    const card = page.getByText("CE401").first();
    const box = (await card.boundingBox())!;
    const [tx, ty] = [706, 469];
    await page.mouse.move(box.x + 20, box.y + 8);
    await page.mouse.down();
    for (let i = 1; i <= 20; i += 1) {
      await page.mouse.move(box.x + 20 + ((tx - box.x - 20) * i) / 20, box.y + 8 + ((ty - box.y - 8) * i) / 20);
      await page.waitForTimeout(25);
    }
    await page.mouse.up();
    const day = page.getByLabel("Day of week").first();
    await expect(day).toContainText("Mon");

    // picking the faculty makes the scheduler suggest a slot; that must not lock the form
    await page.getByText("Select faculty").first().click();
    await page.getByRole("option", { name: /Santos/ }).first().click();
    await page.waitForTimeout(1500);

    await day.click();
    await page.getByRole("option", { name: "Wed" }).click();
    await page.waitForTimeout(1500);
    await expect(day).toContainText("Wed");
    const start = page.locator('input[type="time"]').first();
    await start.fill("14:00");
    await page.waitForTimeout(1000);
    await expect(start).toHaveValue("14:00");
    await expect(day).toContainText("Wed");
  });
});
