import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.E2E_PASSWORD ?? "Test123!";
const API = process.env.E2E_API_URL ?? "http://localhost:4000";
/** The College of Engineering. The admin names it when a call needs a college, since other colleges may exist. */
const COE = "00000000-0000-0000-0000-0000000000a2";

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
    await expect(dialog.getByRole("heading", { name: "v0.7.3" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "v0.7.1" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "v0.7.0" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "v0.6.2" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "v0.6.1" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "v0.6.0" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "v0.5.0" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "v0.4.1" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "v0.4.0" })).toBeVisible();
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
    expect((await request.put(`${API}/academic-years/current-term`, { headers: admin, data: { academicYearId: original!.id, semester: 4, collegeId: COE } })).status()).toBe(400);

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
      await request.put(`${API}/academic-years/current-term`, { headers: admin, data: { academicYearId: original!.id, semester: 3, collegeId: COE } });
      await page.goto("/schedules/rooms");
      await expect(page.getByRole("combobox", { name: "Semester" })).toHaveText(/Mid Year/);
    } finally {
      await request.put(`${API}/academic-years/current-term`, { headers: admin, data: { academicYearId: original!.id, semester: original!.currentSemester ?? 1, collegeId: COE } });
    }
  });
});

test.describe("scheduler legend", () => {
  test("the curriculum pane explains the subject status colours and the schedule panel explains the block markers", async ({ page }) => {
    await login(page, "chairman@coe.vantage");
    await page.goto("/scheduler");
    const legends = page.getByRole("button", { name: "Legend" });
    await expect(legends).toHaveCount(2);

    await legends.first().click();
    let menu = page.getByRole("menu");
    for (const text of ["Not scheduled yet", "Partly scheduled", "Fully scheduled", "Over-scheduled"]) await expect(menu.getByText(text)).toBeVisible();
    await expect(menu.getByText("Dashed border: laboratory-only subject")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);

    await legends.nth(1).click();
    menu = page.getByRole("menu");
    for (const text of ["Dashed border: laboratory-only subject", "Amber outline: awaiting approval", "Red: conflict with another block", "Class split between instructors"]) await expect(menu.getByText(text)).toBeVisible();
    await expect(menu.getByText("Not scheduled yet")).toHaveCount(0);
  });
});

test.describe("university pages", () => {
  async function token(request: import("@playwright/test").APIRequestContext, email: string) {
    return ((await (await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } })).json()) as { accessToken: string }).accessToken;
  }

  test("the admin adds a college and the president sees every college read-only", async ({ page, request }) => {
    const admin = { Authorization: `Bearer ${await token(request, "admin@coe.vantage")}` };
    const stamp = Date.now();
    const presidentEmail = `pres${stamp}@coe.vantage`;
    const made = await request.post(`${API}/users`, { headers: admin, data: { email: presidentEmail, password: PASSWORD, name: `President ${stamp}`, role: "PRESIDENT" } });
    expect(made.status()).toBe(201);
    const presidentId = ((await made.json()) as { id: string }).id;
    const collegeName = `Admin Test College ${stamp}`;
    let collegeId = "";
    try {
      // the admin creates a college from the Colleges page
      await login(page, "admin@coe.vantage");
      await page.getByRole("link", { name: "Colleges", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Colleges" })).toBeVisible();
      await page.getByRole("button", { name: "Add college" }).click();
      const dialog = page.getByRole("dialog", { name: "Add college" });
      await dialog.getByLabel("Name").fill(collegeName);
      await dialog.getByRole("button", { name: "Save" }).click();
      await expect(page.getByRole("cell", { name: collegeName, exact: true })).toBeVisible();
      collegeId = ((await (await request.get(`${API}/colleges`, { headers: admin })).json()) as { id: string; name: string }[]).find((c) => c.name === collegeName)!.id;

      // the president lands on the university overview, which lists both colleges
      await page.context().clearCookies();
      await page.evaluate(() => window.localStorage.clear());
      await login(page, presidentEmail);
      await page.waitForURL("**/university");
      await expect(page.getByRole("heading", { name: collegeName, level: 2 })).toBeVisible();
      await expect(page.getByRole("heading", { name: "College of Engineering", level: 2 })).toBeVisible();
      await expect(page.getByText("You can view everything here and change nothing.")).toBeVisible();

      // read-only everywhere else: no Add buttons, no audit log, no user management
      await page.goto("/subjects");
      await expect(page.getByRole("heading", { name: "Subjects" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Add Subject" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Audit log", exact: true })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Users", exact: true })).toHaveCount(0);
      await page.goto("/users");
      await page.waitForURL("**/dashboard**");
    } finally {
      if (collegeId) await request.delete(`${API}/colleges/${collegeId}`, { headers: admin });
      await request.delete(`${API}/users/${presidentId}`, { headers: admin });
      await request.delete(`${API}/users/trash/${presidentId}`, { headers: admin });
    }
  });

  test("the user form of the admin asks for a college, and a college's lock is picked per college", async ({ page, request }) => {
    const admin = { Authorization: `Bearer ${await token(request, "admin@coe.vantage")}` };
    const stamp = Date.now();
    const col = await request.post(`${API}/colleges`, { headers: admin, data: { name: `Lock College ${stamp}` } });
    const collegeId = ((await col.json()) as { id: string }).id;
    try {
      await login(page, "admin@coe.vantage");
      await page.getByRole("link", { name: "Users", exact: true }).click();
      await page.getByRole("button", { name: "Add User" }).click();
      const dialog = page.getByRole("dialog", { name: "Add User" });
      await expect(dialog.getByLabel("College")).toBeVisible();
      await dialog.getByLabel("Role").click();
      await page.getByRole("option", { name: "PRESIDENT" }).click();
      // the president belongs to no college
      await expect(dialog.getByLabel("College")).toHaveCount(0);
      await page.keyboard.press("Escape");

      await page.goto("/academic-years");
      // the college comes from the sidebar switcher, so the page has no picker of its own
      await expect(page.locator("#lock-college")).toHaveCount(0);
      await expect(page.getByText(/Choose a college in the sidebar/)).toBeVisible();
      await page.getByRole("button", { name: /^Switch college/ }).click();
      await page.getByRole("option", { name: /Lock College/ }).click();
      await expect(page.locator('section[aria-label="Current term"]')).toContainText("Lock College");
      await expect(page.getByText(/Choose a college in the sidebar/)).toHaveCount(0);
    } finally {
      await request.delete(`${API}/colleges/${collegeId}`, { headers: admin });
    }
  });
});

test.describe("profile pictures", () => {
  // a 1x1 PNG
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  async function token(request: import("@playwright/test").APIRequestContext, email: string) {
    return ((await (await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } })).json()) as { accessToken: string }).accessToken;
  }
  const bearer = async (request: import("@playwright/test").APIRequestContext, email: string) => ({ Authorization: `Bearer ${await token(request, email)}` });

  test("anyone changes their own name and picture; the picture is checked, size-limited and visible to the college, and removable", async ({ request }) => {
    const me = await bearer(request, "faculty2@coe.vantage");
    const admin = await bearer(request, "admin@coe.vantage");
    const people = (await (await request.get(`${API}/users?role=FACULTY`, { headers: admin })).json()) as { id: string; name: string; email: string; avatarVersion: number | null }[];
    const self = people.find((p) => p.email === "faculty2@coe.vantage")!;
    try {
      // name: needed, trimmed, and nothing else (role, email) changes through this route
      expect((await request.patch(`${API}/users/me`, { headers: me, data: { name: "   " } })).status()).toBe(400);
      const renamed = await request.patch(`${API}/users/me`, { headers: me, data: { name: `  ${self.name} Jr.  `, role: "ADMIN", email: "x@x.com" } });
      expect(renamed.status()).toBe(200);
      const after = (await (await request.get(`${API}/users?role=FACULTY`, { headers: admin })).json()) as { name: string; email: string; role: string; id: string }[];
      const row = after.find((p) => p.id === self.id)!;
      expect([row.name, row.email, row.role]).toEqual([`${self.name} Jr.`, "faculty2@coe.vantage", "FACULTY"]);

      // picture: only real pictures, up to 1 MB
      const upload = (buffer: Buffer, name: string, mimeType: string) => request.put(`${API}/users/me/avatar`, { headers: me, multipart: { image: { name, mimeType, buffer } } });
      expect((await upload(Buffer.from("not a picture"), "x.png", "image/png")).status()).toBe(400);
      const big = await upload(Buffer.concat([PNG, Buffer.alloc(1.2 * 1024 * 1024)]), "big.png", "image/png");
      expect(big.status()).toBe(400);
      expect(((await big.json()) as { message: string }).message).toMatch(/larger than 1 MB/);
      const ok = await upload(PNG, "me.png", "image/png");
      expect(ok.status()).toBe(200);
      const { avatarVersion } = (await ok.json()) as { avatarVersion: number };
      expect(avatarVersion).toBeGreaterThan(0);

      // the college can see it (admin and the person's chairman), and lists carry its version, never its bytes
      for (const who of ["admin", "chairman"]) {
        const res = await request.get(`${API}/users/${self.id}/avatar`, { headers: await bearer(request, `${who}@coe.vantage`) });
        expect(res.status(), who).toBe(200);
        expect(res.headers()["content-type"]).toBe("image/png");
      }
      const listed = ((await (await request.get(`${API}/users?role=FACULTY`, { headers: admin })).json()) as { id: string; avatarVersion: number | null; avatar?: unknown }[]).find((p) => p.id === self.id)!;
      expect(listed.avatarVersion).toBe(avatarVersion);
      expect(listed.avatar).toBeUndefined();

      // removing it leaves none
      expect((await request.delete(`${API}/users/me/avatar`, { headers: me })).status()).toBe(204);
      expect((await request.get(`${API}/users/${self.id}/avatar`, { headers: admin })).status()).toBe(404);
    } finally {
      await request.patch(`${API}/users/me`, { headers: me, data: { name: self.name } });
      await request.delete(`${API}/users/me/avatar`, { headers: me });
    }
  });

  test("only the admin sets a college's card picture, and the college can see it", async ({ request }) => {
    const admin = await bearer(request, "admin@coe.vantage");
    const chair = await bearer(request, "chairman@coe.vantage");
    const col = (await (await request.post(`${API}/colleges`, { headers: admin, data: { name: `Picture College ${Date.now()}` } })).json()) as { id: string };
    const coe = "00000000-0000-0000-0000-0000000000a2";
    const put = (id: string, headers: Record<string, string>) => request.put(`${API}/colleges/${id}/image`, { headers, multipart: { image: { name: "c.png", mimeType: "image/png", buffer: PNG } } });
    try {
      expect((await put(coe, chair)).status()).toBe(403);
      const ok = await put(col.id, admin);
      expect(ok.status()).toBe(200);
      const { imageVersion } = (await ok.json()) as { imageVersion: number };
      const list = (await (await request.get(`${API}/colleges`, { headers: admin })).json()) as { id: string; imageVersion: number | null }[];
      expect(list.find((c) => c.id === col.id)?.imageVersion).toBe(imageVersion);
      const overview = (await (await request.get(`${API}/university`, { headers: admin })).json()) as { colleges: { id: string; imageVersion: number | null }[] };
      expect(overview.colleges.find((c) => c.id === col.id)?.imageVersion).toBe(imageVersion);
      expect((await request.get(`${API}/colleges/${col.id}/image`, { headers: admin })).headers()["content-type"]).toBe("image/png");
      // a college sees its own picture, not another college's
      expect((await put(coe, admin)).status()).toBe(200);
      expect((await request.get(`${API}/colleges/${coe}/image`, { headers: chair })).status()).toBe(200);
      expect((await request.get(`${API}/colleges/${col.id}/image`, { headers: chair })).status()).toBe(404);
      expect((await request.delete(`${API}/colleges/${coe}/image`, { headers: chair })).status()).toBe(403);
      expect((await request.delete(`${API}/colleges/${col.id}/image`, { headers: admin })).status()).toBe(204);
      expect((await request.get(`${API}/colleges/${col.id}/image`, { headers: admin })).status()).toBe(404);
    } finally {
      await request.delete(`${API}/colleges/${coe}/image`, { headers: admin });
      await request.delete(`${API}/colleges/${col.id}/image`, { headers: admin });
      await request.delete(`${API}/colleges/${col.id}`, { headers: admin });
    }
  });

  test("the profile page edits the name and picture, and the picture shows in the top bar, the faculty list and the admin's users list", async ({ page, request }) => {
    const admin = await bearer(request, "admin@coe.vantage");
    const me = await bearer(request, "faculty2@coe.vantage");
    const original = "Engr. Carlos Reyes";
    try {
      await login(page, "faculty2@coe.vantage");
      await page.getByRole("link", { name: "Profile", exact: true }).click();
      await expect(page.getByText(/PNG, JPEG or WebP, up to 1 MB/)).toBeVisible();

      await page.getByLabel("Name", { exact: true }).fill("Engr. Carlos Reyes Jr.");
      await page.getByRole("button", { name: "Save name" }).click();
      await expect(page.getByText("Name saved")).toBeVisible();

      await page.getByLabel("Choose a picture").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
      await expect(page.getByText("Picture saved")).toBeVisible();
      await expect(page.locator('header img[alt="Engr. Carlos Reyes Jr."]')).toBeVisible();
      await expect(page.getByRole("button", { name: "Remove" })).toBeVisible();

      // the chairman's faculty list and the admin's users list show it beside the name
      await page.context().clearCookies();
      await page.evaluate(() => window.sessionStorage.clear());
      await login(page, "chairman@coe.vantage");
      await page.goto("/faculty");
      await expect(page.locator('tr:has-text("Engr. Carlos Reyes Jr.") img')).toBeVisible();
      await page.context().clearCookies();
      await page.evaluate(() => window.sessionStorage.clear());
      await login(page, "admin@coe.vantage");
      await page.goto("/users");
      await expect(page.locator('tr:has-text("Engr. Carlos Reyes Jr.") img')).toBeVisible();
    } finally {
      await request.patch(`${API}/users/me`, { headers: me, data: { name: original } });
      await request.delete(`${API}/users/me/avatar`, { headers: me });
      void admin;
    }
  });
});

test.describe("college switcher and unit viewers", () => {
  const COE = "00000000-0000-0000-0000-0000000000a2";
  type Named = { id: string; name: string };
  async function token(request: import("@playwright/test").APIRequestContext, email: string) {
    return ((await (await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } })).json()) as { accessToken: string }).accessToken;
  }
  const bearer = async (request: import("@playwright/test").APIRequestContext, email: string, college?: string) => ({
    Authorization: `Bearer ${await token(request, email)}`,
    ...(college ? { "X-College-Id": college } : {}),
  });

  async function setup(request: import("@playwright/test").APIRequestContext) {
    const admin = await bearer(request, "admin@coe.vantage");
    const stamp = Date.now();
    const col = (await (await request.post(`${API}/colleges`, { headers: admin, data: { name: `Switch College ${stamp}` } })).json()) as Named;
    const dept = (await (await request.post(`${API}/departments`, { headers: admin, data: { name: `Switch Dept ${stamp} (SW${stamp % 1000})`, collegeId: col.id } })).json()) as Named;
    const made: string[] = [];
    const user = async (prefix: string, data: Record<string, unknown>) => {
      const email = `${prefix}${stamp}@coe.vantage`;
      const r = await request.post(`${API}/users`, { headers: admin, data: { email, password: PASSWORD, name: `${prefix} ${stamp}`, ...data } });
      expect(r.status(), `create ${prefix}: ${await r.text()}`).toBe(201);
      made.push(((await r.json()) as Named).id);
      return email;
    };
    const cleanup = async () => {
      for (const id of made) {
        await request.delete(`${API}/users/${id}`, { headers: admin });
        await request.delete(`${API}/users/trash/${id}`, { headers: admin });
      }
      await request.delete(`${API}/departments/${dept.id}`, { headers: admin });
      await request.delete(`${API}/departments/trash/${dept.id}`, { headers: admin });
      await request.delete(`${API}/colleges/${col.id}`, { headers: admin });
    };
    return { admin, stamp, col, dept, user, cleanup };
  }
  const names = async (request: import("@playwright/test").APIRequestContext, headers: Record<string, string>, path: string) =>
    ((await (await request.get(`${API}${path}`, { headers })).json()) as Named[]).map((x) => x.name);

  test("the admin and president look at one college at a time; everyone else is held to their own", async ({ request }) => {
    const s = await setup(request);
    try {
      const everything = await names(request, s.admin, "/departments");
      expect(everything.some((n) => n.startsWith("Switch Dept"))).toBe(true);
      expect(everything.length).toBeGreaterThan(1);
      // choosing a college limits every list to it
      expect(await names(request, { ...s.admin, "X-College-Id": s.col.id }, "/departments")).toEqual([s.dept.name]);
      const coeOnly = await names(request, { ...s.admin, "X-College-Id": COE }, "/departments");
      expect(coeOnly.length).toBeGreaterThan(1);
      expect(coeOnly.some((n) => n.startsWith("Switch Dept"))).toBe(false);
      // a made-up header is ignored
      expect((await names(request, { ...s.admin, "X-College-Id": "not-a-college" }, "/departments")).length).toBe(everything.length);

      // a new record made while viewing a college belongs to it, with no college to pick
      const viewing = { ...s.admin, "X-College-Id": s.col.id };
      const created = await request.post(`${API}/departments`, { headers: viewing, data: { name: `Viewed Dept ${s.stamp} (VW${s.stamp % 1000})` } });
      expect(created.status()).toBe(201);
      const viewedId = ((await created.json()) as Named).id;
      expect(await names(request, { ...s.admin, "X-College-Id": COE }, "/departments")).not.toContain(`Viewed Dept ${s.stamp} (VW${s.stamp % 1000})`);
      expect(await names(request, viewing, "/departments")).toContain(`Viewed Dept ${s.stamp} (VW${s.stamp % 1000})`);
      await request.delete(`${API}/departments/${viewedId}`, { headers: s.admin });
      await request.delete(`${API}/departments/trash/${viewedId}`, { headers: s.admin });

      // the college list is never narrowed by the choice, so the switcher keeps every college
      expect((await names(request, viewing, "/colleges")).length).toBeGreaterThan(1);

      // the president can look at one college too; a dean cannot step outside their own
      const presEmail = await s.user("presview", { role: "PRESIDENT" });
      expect(await names(request, await bearer(request, presEmail, s.col.id), "/departments")).toEqual([s.dept.name]);
      const dean = await bearer(request, "dean@coe.vantage", s.col.id);
      const deanSees = await names(request, dean, "/departments");
      expect(deanSees.some((n) => n.startsWith("Switch Dept"))).toBe(false);
      expect(deanSees.length).toBeGreaterThan(1);
    } finally {
      await s.cleanup();
    }
  });

  test("a unit viewer sees only the colleges and areas the admin granted, and changes nothing", async ({ request }) => {
    const s = await setup(request);
    try {
      // the grants are required
      expect((await request.post(`${API}/users`, { headers: s.admin, data: { email: `bad${s.stamp}@coe.vantage`, password: PASSWORD, name: "Bad", role: "UNIT", unitColleges: [], unitAreas: ["ROOMS"] } })).status()).toBe(400);
      expect((await request.post(`${API}/users`, { headers: s.admin, data: { email: `bad${s.stamp}@coe.vantage`, password: PASSWORD, name: "Bad", role: "UNIT", unitColleges: [s.col.id], unitAreas: [] } })).status()).toBe(400);

      const roomsOnly = await s.user("unitrooms", { role: "UNIT", unitColleges: [s.col.id], unitAreas: ["ROOMS"] });
      const login = (await (await request.post(`${API}/auth/login`, { data: { email: roomsOnly, password: PASSWORD } })).json()) as { user: { role: string; unitColleges: string[]; unitAreas: string[] } };
      expect(login.user).toMatchObject({ role: "UNIT", unitColleges: [s.col.id], unitAreas: ["ROOMS"] });
      const rooms = await bearer(request, roomsOnly);
      // only the granted college, and only the granted area
      expect(await names(request, rooms, "/colleges")).toEqual([s.col.name]);
      const overview = (await (await request.get(`${API}/university`, { headers: rooms })).json()) as { colleges: Named[] };
      expect(overview.colleges.map((c) => c.name)).toEqual([s.col.name]);
      expect((await request.get(`${API}/rooms`, { headers: rooms })).status()).toBe(200);
      expect((await request.get(`${API}/subjects`, { headers: rooms })).status()).toBe(403);
      expect((await request.get(`${API}/departments`, { headers: rooms })).status()).toBe(403);
      expect((await request.get(`${API}/faculty-loads`, { headers: rooms })).status()).toBe(403);
      // never a write, and never the audit log
      expect((await request.post(`${API}/rooms`, { headers: rooms, data: { name: "X", capacity: 10 } })).status()).toBe(403);
      expect((await request.get(`${API}/audit`, { headers: rooms })).status()).toBe(403);
      // asking for a college that was not granted changes nothing
      const sneaky = { ...rooms, "X-College-Id": COE };
      expect((await names(request, sneaky, "/rooms")).length).toBe((await names(request, rooms, "/rooms")).length);

      // two colleges and two areas: the departments of both, one at a time when chosen
      const both = await s.user("unitboth", { role: "UNIT", unitColleges: [COE, s.col.id], unitAreas: ["ROOMS", "CURRICULUM"] });
      const viewer = await bearer(request, both);
      expect((await names(request, viewer, "/departments")).length).toBeGreaterThan(2);
      expect(await names(request, { ...viewer, "X-College-Id": s.col.id }, "/departments")).toEqual([s.dept.name]);
      expect(await names(request, viewer, "/colleges")).toEqual(expect.arrayContaining([s.col.name, "College of Engineering"]));
      expect((await request.get(`${API}/subjects`, { headers: viewer })).status()).toBe(200);
      expect((await request.get(`${API}/reports/export/class-schedules?academicYearId=00000000-0000-0000-0000-000000000000`, { headers: viewer })).status()).toBe(403);
    } finally {
      await s.cleanup();
    }
  });

  test("the sidebar switches colleges for the admin, is locked for a college's own people, and shows a unit viewer only what was granted", async ({ page, request }) => {
    const s = await setup(request);
    try {
      const unit = await s.user("unitnav", { role: "UNIT", unitColleges: [s.col.id, COE], unitAreas: ["ROOMS", "REPORTS"] });

      // the admin: a switcher with search; picking a college narrows the pages to it
      await login(page, "admin@coe.vantage");
      const switcher = page.getByRole("button", { name: /^Switch college/ });
      await expect(switcher).toBeVisible();
      await switcher.click();
      await page.getByLabel("Search colleges").fill("Switch");
      await page.getByRole("option", { name: new RegExp(s.col.name) }).click();
      await expect(page.getByRole("button", { name: new RegExp(`Switch college, now ${s.col.name}`) })).toBeVisible();
      await page.goto("/departments");
      await expect(page.getByRole("cell", { name: s.dept.name, exact: true })).toBeVisible();
      await expect(page.getByRole("cell", { name: /Civil Engineering/ })).toHaveCount(0);
      // back to every college
      await page.getByRole("button", { name: /^Switch college/ }).click();
      await page.getByRole("option", { name: "All colleges" }).click();
      await expect(page.getByRole("cell", { name: /Civil Engineering/ }).first()).toBeVisible();

      // a dean belongs to one college: the switcher is a locked label
      await page.context().clearCookies();
      await page.evaluate(() => { window.sessionStorage.clear(); window.localStorage.clear(); });
      await login(page, "dean@coe.vantage");
      await expect(page.getByRole("button", { name: /^Your college: College of Engineering/ })).toBeDisabled();

      // a unit viewer: the colleges they were granted, and only the granted areas in the menu
      await page.context().clearCookies();
      await page.evaluate(() => { window.sessionStorage.clear(); window.localStorage.clear(); });
      await page.goto("/login");
      await page.getByLabel("Email").fill(unit);
      await page.locator("#password").fill(PASSWORD);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL("**/university");
      await expect(page.getByRole("button", { name: /^Switch college/ })).toBeVisible();
      const nav = page.getByRole("navigation").first();
      await expect(nav.getByRole("link", { name: "Rooms", exact: true })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Reports", exact: true })).toBeVisible();
      for (const hidden of ["Subjects", "Departments", "Faculty schedule", "Users", "Colleges", "Audit log", "Dashboard"]) {
        await expect(nav.getByRole("link", { name: hidden, exact: true }), hidden).toHaveCount(0);
      }
    } finally {
      await s.cleanup();
    }
  });
});

test.describe("colleges", () => {
  async function token(request: import("@playwright/test").APIRequestContext, email: string) {
    return ((await (await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } })).json()) as { accessToken: string }).accessToken;
  }
  type Named = { id: string; name: string; email?: string };

  test("a second college is isolated from the first, each locks its own semester, and the president views both but changes nothing", async ({ request }) => {
    const bearer = async (email: string) => ({ Authorization: `Bearer ${await token(request, email)}` });
    const admin = await bearer("admin@coe.vantage");
    const coeDean = await bearer("dean@coe.vantage");
    const stamp = Date.now();
    const made: { college?: string; dept?: string; users: string[] } = { users: [] };
    const asAdmin = async <T,>(path: string) => (await (await request.get(`${API}${path}`, { headers: admin })).json()) as T;
    const ay = await asAdmin<{ id: string }>("/academic-years/active");
    try {
      // the admin creates a second college with its own department and people
      const col = await request.post(`${API}/colleges`, { headers: admin, data: { name: `Test College ${stamp}`, code: "TC" } });
      expect(col.status()).toBe(201);
      made.college = ((await col.json()) as Named).id;
      const dept = await request.post(`${API}/departments`, { headers: admin, data: { name: `Test Department ${stamp} (TD${stamp % 1000})`, collegeId: made.college } });
      expect(dept.status()).toBe(201);
      made.dept = ((await dept.json()) as Named).id;
      const person = async (prefix: string, role: string, departmentId?: string) => {
        const email = `${prefix}${stamp}@coe.vantage`;
        const r = await request.post(`${API}/users`, { headers: admin, data: { email, password: PASSWORD, name: `${prefix} ${stamp}`, role, collegeId: role === "PRESIDENT" ? undefined : made.college, ...(departmentId ? { departmentId } : {}) } });
        expect(r.status(), `create ${role}`).toBe(201);
        made.users.push(((await r.json()) as Named).id);
        return email;
      };
      const deanB = await bearer(await person("deanb", "DEAN"));
      const secB = await bearer(await person("secb", "COLLEGE_SECRETARY"));
      const president = await bearer(await person("pres", "PRESIDENT"));

      const names = async (headers: Record<string, string>, path: string) => ((await (await request.get(`${API}${path}`, { headers })).json()) as Named[]).map((x) => x.name);

      // college B sees only itself; college A never sees B
      expect(await names(deanB, "/departments")).toEqual([`Test Department ${stamp} (TD${stamp % 1000})`]);
      for (const path of ["/subjects", "/student-classes", "/rooms", "/curriculum"]) expect(await names(deanB, path), path).toEqual([]);
      const usersB = await names(deanB, "/users");
      expect(usersB.every((n) => /\d{13}$/.test(n))).toBe(true);
      expect(usersB.some((n) => n.startsWith("deanb"))).toBe(true);
      expect(await names(deanB, "/colleges")).toEqual([`Test College ${stamp}`]);
      const coeDepts = await names(coeDean, "/departments");
      expect(coeDepts.some((n) => n.startsWith("Test Department"))).toBe(false);
      expect((await names(coeDean, "/users")).some((n) => n.endsWith(String(stamp)))).toBe(false);
      expect((await request.get(`${API}/departments/${made.dept}`, { headers: coeDean })).status()).toBe(404);
      expect((await request.get(`${API}/departments/${(await asAdmin<Named[]>("/departments"))[0].id}`, { headers: deanB })).status()).toBe(404);

      // a dean cannot put people in, or lock, another college
      expect((await request.post(`${API}/users`, { headers: deanB, data: { email: `x${stamp}@coe.vantage`, password: PASSWORD, name: "x", role: "FACULTY", collegeId: (await asAdmin<Named[]>("/colleges"))[0].id } })).status()).not.toBe(201);

      // semester locks are per college
      expect((await request.put(`${API}/academic-years/${ay.id}/term-lock`, { headers: secB, data: { semester: 3, locked: true } })).status()).toBe(200);
      const years = async (headers: Record<string, string>) => (await (await request.get(`${API}/academic-years`, { headers })).json()) as { id: string; termLocks: { semester: number; collegeId: string }[] }[];
      expect((await years(deanB)).find((y) => y.id === ay.id)?.termLocks.map((l) => l.semester)).toContain(3);
      expect((await years(coeDean)).find((y) => y.id === ay.id)?.termLocks.some((l) => l.collegeId === made.college)).toBe(false);
      expect((await request.put(`${API}/academic-years/${ay.id}/term-lock`, { headers: coeDean, data: { semester: 3, locked: false, collegeId: made.college } })).status()).toBe(403);
      await request.put(`${API}/academic-years/${ay.id}/term-lock`, { headers: secB, data: { semester: 3, locked: false } });

      // the audit log of a college shows its own entries only
      const trailB = ((await (await request.get(`${API}/audit?entityId=${made.dept}`, { headers: deanB })).json()) as { items: unknown[] }).items;
      const trailA = ((await (await request.get(`${API}/audit?entityId=${made.dept}`, { headers: coeDean })).json()) as { items: unknown[] }).items;
      expect(trailB.length).toBeGreaterThan(0);
      expect(trailA.length).toBe(0);

      // the president views every college and changes nothing
      const overview = (await (await request.get(`${API}/university`, { headers: president })).json()) as { colleges: { name: string; departments: number }[] };
      expect(overview.colleges.map((c) => c.name)).toEqual(expect.arrayContaining([`Test College ${stamp}`, "College of Engineering"]));
      expect((await names(president, "/departments")).length).toBeGreaterThan(coeDepts.length);
      expect((await request.post(`${API}/departments`, { headers: president, data: { name: `Nope ${stamp}` } })).status()).toBe(403);
      expect((await request.put(`${API}/academic-years/${ay.id}/term-lock`, { headers: president, data: { semester: 3, locked: true } })).status()).toBe(403);
      expect((await request.get(`${API}/university`, { headers: deanB })).status()).toBe(403);
    } finally {
      for (const id of made.users) await request.delete(`${API}/users/${id}`, { headers: admin });
      if (made.dept) await request.delete(`${API}/departments/${made.dept}`, { headers: admin });
      if (made.college) await request.delete(`${API}/colleges/${made.college}`, { headers: admin });
      for (const id of made.users) await request.delete(`${API}/users/trash/${id}`, { headers: admin });
      if (made.dept) await request.delete(`${API}/departments/trash/${made.dept}`, { headers: admin });
    }
  });

  test("each college sets its own current term, or none, and a shared academic year name exists only once", async ({ request }) => {
    const bearer = async (email: string) => ({ Authorization: `Bearer ${await token(request, email)}` });
    const admin = await bearer("admin@coe.vantage");
    const coeSecretary = await bearer("secretary@coe.vantage");
    const stamp = Date.now();
    const made: { college?: string; user?: string; years: string[] } = { years: [] };
    type Year = { id: string; name: string; isActive: boolean; currentSemester: number };
    const years = async (headers: Record<string, string>) => (await (await request.get(`${API}/academic-years`, { headers })).json()) as Year[];
    const currentOf = async (headers: Record<string, string>) => (await years(headers)).find((y) => y.isActive);
    const coeBefore = await currentOf(coeSecretary);
    try {
      const col = await request.post(`${API}/colleges`, { headers: admin, data: { name: `Term College ${stamp}` } });
      made.college = ((await col.json()) as Named).id;
      const email = `termsec${stamp}@coe.vantage`;
      const u = await request.post(`${API}/users`, { headers: admin, data: { email, password: PASSWORD, name: `Term Sec ${stamp}`, role: "COLLEGE_SECRETARY", collegeId: made.college } });
      expect(u.status()).toBe(201);
      made.user = ((await u.json()) as Named).id;
      const secB = await bearer(email);

      // academic years are shared: both colleges list the same years, and a name can exist only once
      const created = await request.post(`${API}/academic-years`, { headers: secB, data: { name: `Shared ${stamp}` } });
      expect(created.status()).toBe(201);
      const shared = (await created.json()) as Year;
      made.years.push(shared.id);
      expect((await years(coeSecretary)).some((y) => y.id === shared.id)).toBe(true);
      expect((await request.post(`${API}/academic-years`, { headers: coeSecretary, data: { name: `shared ${stamp}` } })).status()).toBe(409);
      expect((await request.post(`${API}/academic-years`, { headers: admin, data: { name: `  SHARED ${stamp} ` } })).status()).toBe(409);

      // college B has not started, and COE's term is unaffected
      expect(await currentOf(secB)).toBeUndefined();
      const set = await request.put(`${API}/academic-years/current-term`, { headers: secB, data: { academicYearId: shared.id, semester: 2 } });
      expect(set.status()).toBe(200);
      const b = await currentOf(secB);
      expect([b?.id, b?.currentSemester]).toEqual([shared.id, 2]);
      expect((await currentOf(coeSecretary))?.id).toBe(coeBefore?.id);
      expect((await (await request.get(`${API}/academic-years/active`, { headers: secB })).json() as Year).id).toBe(shared.id);

      // a college secretary cannot set another college's term; the admin can, naming the college
      expect((await request.put(`${API}/academic-years/current-term`, { headers: coeSecretary, data: { academicYearId: shared.id, semester: 1, collegeId: made.college } })).status()).toBe(403);
      expect((await request.put(`${API}/academic-years/current-term`, { headers: admin, data: { academicYearId: shared.id, semester: 3, collegeId: made.college } })).status()).toBe(200);
      expect((await currentOf(secB))?.currentSemester).toBe(3);

      // "not at all": a college can go back to not started
      expect((await request.put(`${API}/academic-years/current-term`, { headers: secB, data: { academicYearId: null } })).status()).toBe(200);
      expect(await currentOf(secB)).toBeUndefined();
      expect((await (await request.get(`${API}/academic-years/active`, { headers: secB })).json())).toBeNull();
      expect((await currentOf(coeSecretary))?.id).toBe(coeBefore?.id);

      // the university overview shows each college's own term
      const overview = (await (await request.get(`${API}/university`, { headers: admin })).json()) as { colleges: { name: string; currentTerm: unknown }[] };
      expect(overview.colleges.find((c) => c.name === `Term College ${stamp}`)?.currentTerm).toBeNull();
      expect(overview.colleges.find((c) => c.name === "College of Engineering")?.currentTerm).not.toBeNull();
    } finally {
      for (const id of made.years) {
        await request.delete(`${API}/academic-years/${id}`, { headers: admin });
        await request.delete(`${API}/academic-years/trash/${id}`, { headers: admin });
      }
      if (made.user) {
        await request.delete(`${API}/users/${made.user}`, { headers: admin });
        await request.delete(`${API}/users/trash/${made.user}`, { headers: admin });
      }
      if (made.college) await request.delete(`${API}/colleges/${made.college}`, { headers: admin });
    }
  });

  test("the admin's GE subjects page asks for a college and says plainly when no sheet has been added", async ({ page, request }) => {
    const admin = { Authorization: `Bearer ${await token(request, "admin@coe.vantage")}` };
    const col = (await (await request.post(`${API}/colleges`, { headers: admin, data: { name: `GE Probe ${Date.now()}` } })).json()) as Named;
    try {
      await login(page, "admin@coe.vantage");
      await page.getByRole("link", { name: "GE subjects", exact: true }).click();
      await expect(page.locator("#ge-college")).toBeVisible();
      await page.locator("#ge-college").selectOption({ label: col.name });
      // a college with no sheet is an ordinary empty state, not an error
      await expect(page.getByText(/No GE subjects have been added for/)).toBeVisible();
      await expect(page.getByRole("alert")).toHaveCount(0);
    } finally {
      await request.delete(`${API}/colleges/${col.id}`, { headers: admin });
    }
  });

  test("the dean views the GE subjects and their history but cannot add, replace or remove the sheet", async ({ page, request }) => {
    await login(page, "dean@coe.vantage");
    await page.getByRole("link", { name: "GE subjects", exact: true }).click();
    await expect(page.getByRole("heading", { name: "GE subjects" })).toBeVisible();
    await expect(page.getByLabel("Saved GE schedule")).toBeVisible();
    await expect(page.getByLabel("Add the GE schedule")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(0);
    await page.getByRole("button", { name: "History" }).click();
    await expect(page.getByRole("dialog", { name: "GE subjects history" })).toBeVisible();
    await page.keyboard.press("Escape");

    // the server agrees: reading is allowed, changing is not
    const t = await token(request, "dean@coe.vantage");
    const h = { Authorization: `Bearer ${t}` };
    const ay = (await (await request.get(`${API}/academic-years/active`, { headers: h })).json()) as { id: string };
    expect((await request.get(`${API}/ge-import/college?academicYearId=${ay.id}&semester=1`, { headers: h })).status()).toBe(200);
    expect((await request.put(`${API}/ge-import/college`, { headers: h, data: { academicYearId: ay.id, semester: 1, text: "x" } })).status()).toBe(403);
    expect((await request.delete(`${API}/ge-import/college?academicYearId=${ay.id}&semester=1`, { headers: h })).status()).toBe(403);
  });

  test("the dean views the faculty of the whole college, with their history, and cannot add or change anyone", async ({ page, request }) => {
    await login(page, "dean@coe.vantage");
    await page.getByRole("link", { name: "Faculty", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Faculty", exact: true })).toBeVisible();
    // college-wide: a department column, and faculty of more than one department
    await expect(page.getByRole("columnheader", { name: "Department" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Faculty" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Copy possible subjects/ })).toHaveCount(0);
    await expect(page.locator('button[aria-label^="Edit "]')).toHaveCount(0);
    await expect(page.locator('button[aria-label^="Actions for "]')).toHaveCount(0);

    // possible subjects can be read, not edited
    await page.locator('button[aria-label^="Manage possible subjects for "]').first().click();
    const dialog = page.getByRole("dialog", { name: /Possible subjects to teach/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Choose subject to add")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Add", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "History" }).click();
    await expect(page.getByRole("dialog", { name: "Faculty history" })).toBeVisible();
    await page.keyboard.press("Escape");

    // the server agrees
    const t = ((await (await request.post(`${API}/auth/login`, { data: { email: "dean@coe.vantage", password: PASSWORD } })).json()) as { accessToken: string }).accessToken;
    const h = { Authorization: `Bearer ${t}` };
    const people = (await (await request.get(`${API}/users?role=FACULTY`, { headers: h })).json()) as { id: string; departmentId: string | null }[];
    expect(new Set(people.map((p) => p.departmentId)).size).toBeGreaterThan(1);
    expect((await request.post(`${API}/users`, { headers: h, data: { email: `x${Date.now()}@coe.vantage`, password: PASSWORD, name: "x", role: "FACULTY" } })).status()).toBe(403);
    expect((await request.patch(`${API}/users/${people[0].id}`, { headers: h, data: { maxUnits: 5 } })).status()).toBe(403);
  });

  test("every role has the college it should: the first college's people belong to it, the admin and president to none", async ({ request }) => {
    const t = await token(request, "admin@coe.vantage");
    const users = (await (await request.get(`${API}/users`, { headers: { Authorization: `Bearer ${t}` } })).json()) as { email: string; role: string; collegeId: string | null }[];
    const dean = users.find((u) => u.email === "dean@coe.vantage")!;
    expect(dean.collegeId).toBeTruthy();
    expect(users.find((u) => u.email === "chairman@coe.vantage")!.collegeId).toBe(dean.collegeId);
    expect(users.find((u) => u.email === "admin@coe.vantage")!.collegeId).toBeNull();
    expect(users.filter((u) => u.role === "PRESIDENT").every((u) => u.collegeId === null)).toBe(true);
  });
});

test.describe("audit log", () => {
  type Entry = { id: string; actorName: string; actorRole: string; entityType: string; entityId: string | null; entityLabel: string | null; action: string; summary: string; changes: Record<string, { from?: unknown; to?: unknown }> | null };
  async function token(request: import("@playwright/test").APIRequestContext, email: string, password = PASSWORD) {
    return ((await (await request.post(`${API}/auth/login`, { data: { email, password } })).json()) as { accessToken: string }).accessToken;
  }

  test("changes to core records are recorded with who did them, and a later role change leaves old entries intact", async ({ request }) => {
    const bearer = async (email: string) => ({ Authorization: `Bearer ${await token(request, email)}` });
    const admin = await bearer("admin@coe.vantage");
    const stamp = Date.now();
    const email = `audit${stamp}@coe.vantage`;
    const ids: { year?: string; user?: string } = {};
    try {
      // a college secretary created just for this test makes a change
      const made = await request.post(`${API}/users`, { headers: admin, data: { email, password: PASSWORD, name: `Audit Tester ${stamp}`, role: "COLLEGE_SECRETARY", collegeId: COE } });
      expect(made.status()).toBe(201);
      ids.user = ((await made.json()) as { id: string }).id;
      const secretary = { Authorization: `Bearer ${await token(request, email)}` };
      const year = await request.post(`${API}/academic-years`, { headers: secretary, data: { name: `Audit Year ${stamp}` } });
      expect(year.status()).toBe(201);
      ids.year = ((await year.json()) as { id: string }).id;
      await request.patch(`${API}/academic-years/${ids.year}`, { headers: secretary, data: { name: `Audit Year ${stamp} renamed` } });

      // the admin then changes that person's role
      expect((await request.patch(`${API}/users/${ids.user}`, { headers: admin, data: { role: "DEAN" } })).status()).toBe(200);

      const list = async (query: string) => ((await (await request.get(`${API}/audit?${query}`, { headers: admin })).json()) as { items: Entry[] }).items;
      const forYear = await list(`entityId=${ids.year}`);
      expect(forYear.map((e) => e.action).sort()).toEqual(["CREATE", "UPDATE"]);
      const rename = forYear.find((e) => e.action === "UPDATE")!;
      expect(rename.changes?.name).toEqual({ from: `Audit Year ${stamp}`, to: `Audit Year ${stamp} renamed` });
      // the entry keeps the role the person had then, not the one they have now
      expect(forYear.every((e) => e.actorRole === "COLLEGE_SECRETARY" && e.actorName === `Audit Tester ${stamp}`)).toBe(true);

      const roleChange = (await list(`entityId=${ids.user}&action=UPDATE`))[0];
      expect(roleChange.actorRole).toBe("ADMIN");
      expect(roleChange.changes?.role).toEqual({ from: "COLLEGE_SECRETARY", to: "DEAN" });
      // secrets never reach the history
      expect(JSON.stringify(await list(`entityId=${ids.user}`))).not.toContain("passwordHash");

      // deleting is recorded, and the history survives the record and the user
      await request.delete(`${API}/academic-years/${ids.year}`, { headers: admin });
      expect((await list(`entityId=${ids.year}&action=DELETE`)).length).toBe(1);
      await request.delete(`${API}/users/${ids.user}`, { headers: admin });
      expect((await list(`entityId=${ids.year}`)).length).toBe(3);
    } finally {
      if (ids.year) await request.delete(`${API}/academic-years/trash/${ids.year}`, { headers: admin });
      if (ids.user) await request.delete(`${API}/users/trash/${ids.user}`, { headers: admin });
    }
  });

  test("only the admin, dean and college secretary can read the history", async ({ request }) => {
    for (const [who, status] of [["admin", 200], ["dean", 200], ["secretary", 200], ["chairman", 403], ["faculty1", 403], ["officer", 403]] as const) {
      const t = await token(request, `${who}@coe.vantage`);
      const res = await request.get(`${API}/audit`, { headers: { Authorization: `Bearer ${t}` } });
      expect(res.status(), who).toBe(status);
    }
    const t = await token(request, "chairman@coe.vantage");
    expect((await request.get(`${API}/audit/export.csv`, { headers: { Authorization: `Bearer ${t}` } })).status()).toBe(403);
  });

  test("schedule blocks are logged when added and removed, not when edited; the current term and locks are logged", async ({ request }) => {
    const bearer = async (email: string) => ({ Authorization: `Bearer ${await token(request, email)}` });
    const [admin, chair, secretary] = await Promise.all(["admin", "chairman", "secretary"].map((n) => bearer(`${n}@coe.vantage`)));
    const get = async <T,>(path: string, headers = chair) => (await (await request.get(`${API}${path}`, { headers })).json()) as T;
    const ay = await get<{ id: string; currentSemester: number }>("/academic-years/active");
    const teacher = (await get<{ id: string; email: string }[]>("/users?role=FACULTY")).find((u) => u.email === "faculty2@coe.vantage");
    const cls = (await get<{ id: string; name: string }[]>("/student-classes")).find((c) => c.name === "BS CE 4A");
    const subject = (await get<{ id: string; code: string }[]>("/subjects")).find((x) => x.code === "CE101");
    const room = (await get<{ id: string; name: string }[]>("/rooms")).find((r) => r.name === "CE-201");
    test.skip(!teacher || !cls || !subject || !room, "needs the seeded CE data");
    const list = async (query: string) => ((await (await request.get(`${API}/audit?${query}`, { headers: admin })).json()) as { items: Entry[] }).items;

    const created = await request.post(`${API}/faculty-loads`, {
      headers: chair,
      data: { subjectId: subject!.id, studentClassId: cls!.id, facultyId: teacher!.id, roomId: room!.id, dayOfWeek: 6, startTime: "17:00", endTime: "18:00", semester: 1, academicYearId: ay.id },
    });
    test.skip(created.status() !== 201, "needs a free Saturday 5 PM slot");
    const id = ((await created.json()) as { id: string }).id;
    await request.patch(`${API}/faculty-loads/${id}`, { headers: chair, data: { startTime: "17:30", endTime: "18:30" } });
    await request.delete(`${API}/faculty-loads/${id}`, { headers: chair });
    const entries = await list(`entityId=${id}`);
    expect(entries.map((e) => e.action).sort()).toEqual(["CREATE", "DELETE"]);
    expect(entries.every((e) => e.entityType === "SCHEDULE_BLOCK" && e.actorRole === "CHAIRMAN")).toBe(true);

    // the current term (set to what it already is) and a semester lock
    await request.put(`${API}/academic-years/current-term`, { headers: secretary, data: { academicYearId: ay.id, semester: ay.currentSemester } });
    const term = (await list("action=SET_CURRENT_TERM"))[0];
    expect(term.actorRole).toBe("COLLEGE_SECRETARY");
    expect(term.summary).toMatch(/Set the current term to/);
    await request.put(`${API}/academic-years/${ay.id}/term-lock`, { headers: secretary, data: { semester: 3, locked: true } });
    await request.put(`${API}/academic-years/${ay.id}/term-lock`, { headers: secretary, data: { semester: 3, locked: false } });
    expect((await list("action=LOCK"))[0].summary).toMatch(/Locked Mid Year/);
    expect((await list("action=UNLOCK"))[0].summary).toMatch(/Unlocked Mid Year/);
  });

  test("the Audit log page and each page's History panel show entries to the dean, and chairmen see neither", async ({ page }) => {
    await login(page, "dean@coe.vantage");
    await page.getByRole("link", { name: "Audit log" }).click();
    await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
    await expect(page.locator("main time").first()).toBeVisible();

    await page.goto("/subjects");
    await page.getByRole("button", { name: "History" }).click();
    const dialog = page.getByRole("dialog", { name: "Subjects history" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Action")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.context().clearCookies();
    await page.evaluate(() => window.localStorage.clear());
    await login(page, "chairman@coe.vantage");
    await expect(page.getByRole("link", { name: "Audit log" })).toHaveCount(0);
    await page.goto("/subjects");
    await expect(page.getByRole("heading", { name: "Subjects" })).toBeVisible();
    await expect(page.getByRole("button", { name: "History" })).toHaveCount(0);
    await page.goto("/audit-log");
    await page.waitForURL("**/dashboard");
  });
});

test.describe("semester lock", () => {
  async function token(request: import("@playwright/test").APIRequestContext, email: string) {
    return ((await (await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } })).json()) as { accessToken: string }).accessToken;
  }

  test("the admin, dean and college secretary lock a semester; while locked nobody changes its schedule", async ({ request }) => {
    const bearer = async (email: string) => ({ Authorization: `Bearer ${await token(request, email)}` });
    const [admin, dean, secretary, chair, faculty] = await Promise.all(["admin", "dean", "secretary", "chairman", "faculty1"].map((n) => bearer(`${n}@coe.vantage`)));
    const get = async <T,>(path: string, headers = chair) => (await (await request.get(`${API}${path}`, { headers })).json()) as T;
    const ay = await get<{ id: string }>("/academic-years/active");
    const users = await get<{ id: string; email: string }[]>("/users?role=FACULTY");
    const teacher = users.find((u) => u.email === "faculty2@coe.vantage");
    const cls = (await get<{ id: string; name: string }[]>("/student-classes")).find((c) => c.name === "BS CE 4A");
    const subject = (await get<{ id: string; code: string }[]>("/subjects")).find((x) => x.code === "CE101");
    const room = (await get<{ id: string; name: string }[]>("/rooms")).find((r) => r.name === "CE-201");
    test.skip(!teacher || !cls || !subject || !room, "needs the seeded CE data");
    const lock = (headers: Record<string, string>, locked: boolean) => request.put(`${API}/academic-years/${ay.id}/term-lock`, { headers, data: { semester: 2, locked, collegeId: COE } });
    const payload = { subjectId: subject!.id, studentClassId: cls!.id, facultyId: teacher!.id, roomId: room!.id, dayOfWeek: 6, startTime: "17:00", endTime: "18:00", semester: 2, academicYearId: ay.id };
    const made: string[] = [];
    try {
      // only the admin, dean and college secretary may lock
      expect((await lock(chair, true)).status()).toBe(403);
      expect((await lock(faculty, true)).status()).toBe(403);
      expect((await lock(dean, true)).status()).toBe(200);
      const years = await get<{ id: string; termLocks: { semester: number; lockedByName: string }[] }[]>("/academic-years", admin);
      expect(years.find((y) => y.id === ay.id)?.termLocks.map((l) => l.semester)).toContain(2);

      // a locked semester refuses the chairman's changes
      const blocked = await request.post(`${API}/faculty-loads`, { headers: chair, data: payload });
      expect(blocked.status()).toBe(403);
      expect(((await blocked.json()) as { message: string }).message).toMatch(/is locked by/);
      expect((await request.post(`${API}/faculty-loads/reset`, { headers: chair, data: { academicYearId: ay.id, semester: 2, studentClassId: cls!.id } })).status()).toBe(403);
      // another semester of the same year is untouched
      expect((await request.post(`${API}/faculty-loads/preview`, { headers: chair, data: { ...payload, semester: 1 } })).status()).toBe(200);

      // unlocking (here by the college secretary) lets changes through again
      expect((await lock(secretary, false)).status()).toBe(200);
      const open = await request.post(`${API}/faculty-loads`, { headers: chair, data: payload });
      expect(open.status()).not.toBe(403);
      if (open.status() === 201) made.push(((await open.json()) as { id: string }).id);

      // locking again also stops edits and deletes of existing blocks
      if (made.length) {
        expect((await lock(admin, true)).status()).toBe(200);
        expect((await request.delete(`${API}/faculty-loads/${made[0]}`, { headers: chair })).status()).toBe(403);
        await lock(admin, false);
      }
    } finally {
      await lock(admin, false);
      for (const id of made) await request.delete(`${API}/faculty-loads/${id}`, { headers: chair });
    }
  });

  test("the dean locks a semester from Academic years and the scheduler shows it as locked", async ({ page, request }) => {
    const admin = { Authorization: `Bearer ${await token(request, "admin@coe.vantage")}` };
    const ay = (await (await request.get(`${API}/academic-years/active`, { headers: admin })).json()) as { id: string; name: string };
    try {
      await login(page, "dean@coe.vantage");
      await page.getByRole("link", { name: "Academic years" }).click();
      await page.getByRole("button", { name: `Lock 2nd Sem of ${ay.name}` }).click();
      const dialog = page.getByRole("dialog", { name: "Lock this semester?" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Lock semester" }).click();
      await expect(page.getByRole("button", { name: `Unlock 2nd Sem of ${ay.name}` })).toHaveAttribute("aria-pressed", "true");

      // the chairman sees the lock in the scheduler once that semester is selected
      await page.context().clearCookies();
      await page.evaluate(() => window.localStorage.clear());
      await login(page, "chairman@coe.vantage");
      await page.goto("/scheduler");
      await page.getByRole("combobox", { name: "Semester" }).click();
      await page.getByRole("option", { name: "2nd Sem" }).click();
      await expect(page.getByRole("status").filter({ hasText: /is locked/ })).toBeVisible();
      await page.getByLabel("Student class").click();
      await page.getByRole("option").nth(1).click();
      await expect(page.getByRole("button", { name: "Add load" })).toBeDisabled();
    } finally {
      await request.put(`${API}/academic-years/${ay.id}/term-lock`, { headers: admin, data: { semester: 2, locked: false, collegeId: COE } });
    }
  });
});

test.describe("reset schedule", () => {
  test("a reset asks in a dialog and the confirm button unlocks after a 3 second countdown", async ({ page }) => {
    await login(page, "chairman@coe.vantage");
    await page.goto("/scheduler");
    await page.getByLabel("Student class").click();
    await page.getByRole("option").nth(1).click();
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: /Reset/ }).click();

    const dialog = page.getByRole("dialog", { name: "Reset schedule?" });
    await expect(dialog).toBeVisible();
    const confirm = dialog.getByRole("button", { name: /^Reset schedule/ });
    await expect(confirm).toBeDisabled();
    await expect(confirm).toHaveText(/\(\d\)/);
    await expect(confirm).toBeEnabled({ timeout: 5000 });
    await expect(confirm).toHaveText("Reset schedule");

    // cancelling leaves everything alone, and reopening starts the countdown again
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: /Reset/ }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: /^Reset schedule \(/ })).toBeDisabled();
    await page.keyboard.press("Escape");
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
      await expect(page.getByText(/No GE subjects have been added for/)).toBeVisible();
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

test.describe("notifications", () => {
  type N = { id: string; type: string; title: string; body: string | null; count: number; readAt: string | null };
  type Inbox = { items: N[]; unread: number; lastSeenVersion: string | null };

  async function token(request: import("@playwright/test").APIRequestContext, email: string) {
    return ((await (await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } })).json()) as { accessToken: string }).accessToken;
  }

  test("a teacher is told about changes to their schedule, once per burst, and only they can read or clear it", async ({ request }) => {
    const chair = { Authorization: `Bearer ${await token(request, "chairman@coe.vantage")}` };
    const get = async <T,>(path: string, headers = chair) => (await (await request.get(`${API}${path}`, { headers })).json()) as T;
    const ay = await get<{ id: string }>("/academic-years/active");
    const users = await get<{ id: string; name: string; email: string }[]>("/users?role=FACULTY");
    const teacher = users.find((u) => u.email === "faculty2@coe.vantage");
    const cls = (await get<{ id: string; name: string }[]>("/student-classes")).find((c) => c.name === "BS CE 4A");
    const subjects = await get<{ id: string; code: string }[]>("/subjects");
    const subject = subjects.find((x) => x.code === "CE101");
    const room = (await get<{ id: string; name: string }[]>("/rooms")).find((r) => r.name === "CE-201");
    test.skip(!teacher || !cls || !subject || !room, "needs the seeded CE data");

    const mine = { Authorization: `Bearer ${await token(request, teacher!.email)}` };
    // start clean: earlier tests may have left an unread schedule notification that new ones would fold into
    await request.post(`${API}/notifications/read-all`, { headers: mine });
    const before = await get<Inbox>("/notifications", mine);
    const made: string[] = [];
    const add = async (day: number) => {
      const r = await request.post(`${API}/faculty-loads`, {
        headers: chair,
        data: { subjectId: subject!.id, studentClassId: cls!.id, facultyId: teacher!.id, roomId: room!.id, dayOfWeek: day, startTime: "17:00", endTime: "18:00", semester: 1, academicYearId: ay.id },
      });
      if (r.status() === 201) made.push(((await r.json()) as { id: string }).id);
      return r.status();
    };
    try {
      const first = await add(6);
      test.skip(first !== 201, "needs a free Saturday 5 PM slot");
      await add(5);

      const inbox = await get<Inbox>("/notifications", mine);
      expect(inbox.unread).toBeGreaterThan(before.unread);
      const schedule = inbox.items.find((n) => n.type === "SCHEDULE" && !n.readAt)!;
      expect(schedule.body).toContain("CE101");
      // two assignments in a row fold into one notification with a count
      expect(schedule.count).toBeGreaterThanOrEqual(2);
      expect(schedule.title).toMatch(/updates\)/);

      // the person who made the change is not told about their own action
      const chairInbox = await get<Inbox>("/notifications");
      expect(chairInbox.items.some((n) => n.id === schedule.id)).toBe(false);

      // another user can neither mark nor remove it
      await request.post(`${API}/notifications/${schedule.id}/read`, { headers: chair });
      await request.delete(`${API}/notifications/${schedule.id}`, { headers: chair });
      expect((await get<Inbox>("/notifications", mine)).items.find((n) => n.id === schedule.id)?.readAt).toBeNull();

      await request.post(`${API}/notifications/${schedule.id}/read`, { headers: mine });
      const after = await get<Inbox>("/notifications", mine);
      expect(after.items.find((n) => n.id === schedule.id)?.readAt).not.toBeNull();
      expect(after.unread).toBe(inbox.unread - 1);

      // removing a block tells them again, and "read all" clears the count
      await request.delete(`${API}/faculty-loads/${made[0]}`, { headers: chair });
      made.shift();
      // the notification is written after the response, so wait for it
      await expect.poll(async () => (await get<Inbox>("/notifications", mine)).unread).toBeGreaterThan(0);
      await request.post(`${API}/notifications/read-all`, { headers: mine });
      expect((await get<Inbox>("/notifications", mine)).unread).toBe(0);
    } finally {
      for (const id of made) await request.delete(`${API}/faculty-loads/${id}`, { headers: chair });
    }
  });

  test("feedback tells the admins, and the author hears about the admin's answer", async ({ request }) => {
    const admin = { Authorization: `Bearer ${await token(request, "admin@coe.vantage")}` };
    const author = { Authorization: `Bearer ${await token(request, "faculty1@coe.vantage")}` };
    const get = async <T,>(path: string, headers: Record<string, string>) => (await (await request.get(`${API}${path}`, { headers })).json()) as T;
    const created = await request.post(`${API}/feedback`, {
      headers: author,
      multipart: { page: "Dashboard", type: "IDEA", title: "Bell e2e idea", description: "Notification test" },
    });
    expect(created.status()).toBe(201);
    const id = ((await created.json()) as { id: string }).id;
    try {
      const adminInbox = await get<Inbox>("/notifications", admin);
      expect(adminInbox.items.some((n) => n.type === "FEEDBACK" && !n.readAt)).toBe(true);

      await request.patch(`${API}/feedback/${id}`, { headers: admin, data: { status: "PLANNED", adminNote: "Next release" } });
      const inbox = await get<Inbox>("/notifications", author);
      const told = inbox.items.find((n) => n.type === "FEEDBACK" && n.body?.includes("Bell e2e idea"));
      expect(told?.body).toContain("Next release");
    } finally {
      await request.delete(`${API}/feedback/${id}`, { headers: admin });
    }
  });

  test("the bell shows the unread count and the new release, and marking all read clears it", async ({ page, request }) => {
    const mine = { Authorization: `Bearer ${await token(request, "faculty1@coe.vantage")}` };
    // pretend this user has not seen the latest release
    await request.post(`${API}/notifications/seen-version`, { headers: mine, data: { version: "v0.1.0" } });
    await login(page, "faculty1@coe.vantage");
    const badge = page.getByTestId("notification-badge");
    await expect(badge).toBeVisible();
    await page.getByRole("button", { name: /^Notifications/ }).click();
    await expect(page.getByText(/is out:/)).toBeVisible();
    await page.getByRole("button", { name: "Mark all read" }).click();
    await expect(badge).toHaveCount(0);
    // opening the release item shows the release notes
    await page.keyboard.press("Escape");
    expect((await (await request.get(`${API}/notifications`, { headers: mine })).json() as Inbox).lastSeenVersion).not.toBe("v0.1.0");
  });
});

test.describe("adding a subject", () => {
  test("a new subject starts in the curriculum being looked at, not ungrouped, and stays visible after saving", async ({ page, request }) => {
    const tok = async (e: string) => ((await (await request.post(`${API}/auth/login`, { data: { email: e, password: PASSWORD } })).json()) as { accessToken: string }).accessToken;
    const admin = { Authorization: `Bearer ${await tok("admin@coe.vantage")}` };
    const name = `Grouped Subject ${Date.now()}`;
    let id = "";
    try {
      await login(page, "chairman@coe.vantage");
      await page.goto("/subjects");
      await expect(page.getByRole("heading", { name: "Subjects" })).toBeVisible();
      await page.getByRole("button", { name: "Add Subject" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add Subject" });
      // the curriculum field is already filled with the one on screen
      await expect(dialog.getByRole("combobox", { name: "Curriculum" })).not.toContainText("No curriculum");
      await dialog.getByPlaceholder("Name", { exact: true }).fill(name);
      await dialog.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("Subject created")).toBeVisible();
      await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();

      const mine = ((await (await request.get(`${API}/subjects`, { headers: admin })).json()) as { id: string; name: string; curriculumId: string | null; departmentId: string | null }[]).find((x) => x.name === name)!;
      id = mine.id;
      expect(mine.curriculumId).toBeTruthy();
    } finally {
      if (id) {
        await request.delete(`${API}/subjects/${id}`, { headers: admin });
        await request.delete(`${API}/subjects/trash/${id}`, { headers: admin });
      }
    }
  });
});

test.describe("subject components", () => {
  test("a subject has lecture and laboratory units; hours and load follow lec + 3 x lab, and the older units + isLab form still works", async ({ request }) => {
    const token = ((await (await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } })).json()) as { accessToken: string }).accessToken;
    const headers = { Authorization: `Bearer ${token}` };
    type S = { id: string; units: number; lecUnits: number; labUnits: number; isLab: boolean };
    const made: string[] = [];
    const stamp = Date.now();
    try {
      const mixed = (await (await request.post(`${API}/subjects`, { headers, data: { code: `MIX${stamp}`, name: "Mixed e2e", lecUnits: 3, labUnits: 1, collegeId: COE } })).json()) as S;
      made.push(mixed.id);
      // 3 lec + 1 lab: 4 units, not a lab-room-only subject
      expect([mixed.units, mixed.lecUnits, mixed.labUnits, mixed.isLab]).toEqual([4, 3, 1, false]);

      // the older form: units + isLab sends everything to one component
      const legacyLab = (await (await request.post(`${API}/subjects`, { headers, data: { code: `LAB${stamp}`, name: "Lab e2e", units: 2, isLab: true, collegeId: COE } })).json()) as S;
      made.push(legacyLab.id);
      expect([legacyLab.units, legacyLab.lecUnits, legacyLab.labUnits, legacyLab.isLab]).toEqual([2, 0, 2, true]);
      const legacyLec = (await (await request.post(`${API}/subjects`, { headers, data: { code: `LEC${stamp}`, name: "Lec e2e", units: 3, collegeId: COE } })).json()) as S;
      made.push(legacyLec.id);
      expect([legacyLec.units, legacyLec.lecUnits, legacyLec.labUnits, legacyLec.isLab]).toEqual([3, 3, 0, false]);

      // editing a lecture subject into 2 lec + 1 lab changes the total, and adding lecture units to a lab subject frees the room rule
      const edited = (await (await request.patch(`${API}/subjects/${legacyLec.id}`, { headers, data: { lecUnits: 2, labUnits: 1 } })).json()) as S;
      expect([edited.units, edited.lecUnits, edited.labUnits, edited.isLab]).toEqual([3, 2, 1, false]);
      const freed = (await (await request.patch(`${API}/subjects/${legacyLab.id}`, { headers, data: { lecUnits: 1 } })).json()) as S;
      expect([freed.units, freed.lecUnits, freed.labUnits, freed.isLab]).toEqual([3, 1, 2, false]);

      // no unit information at all is refused
      expect((await request.post(`${API}/subjects`, { headers, data: { code: `NON${stamp}`, name: "No units", collegeId: COE } })).status()).toBe(400);
    } finally {
      for (const id of made) await request.delete(`${API}/subjects/${id}`, { headers });
    }
  });

  test("the Subjects form edits lecture and laboratory units and explains the hours", async ({ page }) => {
    await login(page, "admin@coe.vantage");
    await page.goto("/subjects");
    await page.getByRole("button", { name: "Add Subject" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Lecture units").fill("3");
    await dialog.getByLabel("Laboratory units").fill("1");
    await expect(dialog.getByText(/Total 4 units\. Needs 6 hrs\/week of blocks and counts 6 units of faculty load/)).toBeVisible();
    await dialog.getByLabel("Lecture units").fill("0");
    await expect(dialog.getByText(/Total 1 unit\. Needs 3 hrs\/week/)).toBeVisible();
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

test.describe("room sharing", () => {
  test("a college asks for the rooms of a college that locked its semester: chairman approves, then the college secretary; the dean only views", async ({ request }) => {
    type Named = { id: string };
    const tok = async (email: string) => ((await (await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } })).json()) as { accessToken: string }).accessToken;
    const bearer = async (email: string) => ({ Authorization: `Bearer ${await tok(email)}` });
    const admin = await bearer("admin@coe.vantage");
    const stamp = Date.now();
    const made = { users: [] as string[], colleges: [] as string[], depts: [] as string[], room: "", curr: "", subj: "", cls: "", loads: [] as string[] };
    const ay = (await (await request.get(`${API}/academic-years/active`, { headers: admin })).json()) as Named;
    const SEM = 3;
    let secH: Record<string, string> | undefined;
    try {
      const post = async <T,>(path: string, data: object, headers = admin, status = 201) => {
        const r = await request.post(`${API}${path}`, { headers, data });
        expect(r.status(), `${path} ${await r.text()}`).toBe(status);
        return (await r.json()) as T;
      };
      const guest = (await post<Named>("/colleges", { name: `Guest College ${stamp}`, code: "GC" })).id;
      made.colleges.push(guest);
      const deptG = (await post<Named>("/departments", { name: `Guest Dept ${stamp} (GD${stamp % 1000})`, collegeId: guest })).id;
      const deptH = (await post<Named>("/departments", { name: `Host Dept ${stamp} (HD${stamp % 1000})`, collegeId: COE })).id;
      made.depts.push(deptG, deptH);
      const person = async (prefix: string, role: string, collegeId: string, departmentId?: string) => {
        const email = `${prefix}${stamp}@coe.vantage`;
        const u = await post<Named>("/users", { email, password: PASSWORD, name: `${prefix} ${stamp}`, role, collegeId, ...(departmentId ? { departmentId } : {}) });
        made.users.push(u.id);
        return bearer(email);
      };
      const chairG = await person("rschairg", "CHAIRMAN", guest, deptG);
      const secG = await person("rssecg", "COLLEGE_SECRETARY", guest);
      const deanG = await person("rsdeang", "DEAN", guest);
      const chairH = await person("rschairh", "CHAIRMAN", COE, deptH);
      secH = await person("rssech", "COLLEGE_SECRETARY", COE);
      const deanH = await person("rsdeanh", "DEAN", COE);

      made.room = (await post<Named>("/rooms", { name: `Shared Room ${stamp}`, capacity: 60, departmentId: deptH })).id;
      made.curr = (await post<Named>("/curriculum", { name: `Guest Curr ${stamp}`, departmentId: deptG })).id;
      made.subj = (await post<Named>("/subjects", { code: `RS${stamp % 100000}`, name: "Shared subject", lecUnits: 3, curriculumId: made.curr, collegeId: guest })).id;
      made.cls = (await post<Named>("/student-classes", { name: `Guest Class ${stamp}`, yearLevel: 1, curriculumId: made.curr, studentCount: 30 })).id;
      const block = { roomId: made.room, academicYearId: ay.id, semester: SEM, studentClassId: made.cls, subjectId: made.subj, dayOfWeek: 1, startTime: "7:00", endTime: "8:00" };
      const overlap = { ...block, startTime: "7:30", endTime: "8:30" };
      const drafts = (headers: Record<string, string>, data: object) => request.post(`${API}/room-share/drafts`, { headers, data });
      const lockCall = (locked: boolean) => request.put(`${API}/academic-years/${ay.id}/term-lock`, { headers: secH!, data: { semester: SEM, locked } });
      const roomIds = async (headers: Record<string, string>) =>
        ((await (await request.get(`${API}/room-share/rooms?academicYearId=${ay.id}&semester=${SEM}`, { headers })).json()) as Named[]).map((r) => r.id);

      // nothing is open before the room's college locks the semester
      expect((await drafts(chairG, block)).status()).toBe(409);
      expect(await roomIds(chairG)).not.toContain(made.room);

      expect((await lockCall(true)).status()).toBe(200);
      expect(await roomIds(chairG)).toContain(made.room);
      expect(await roomIds(secH)).not.toContain(made.room); // a college does not ask for its own rooms

      // only a chairman drafts, and only in other colleges' rooms
      expect((await drafts(deanG, block)).status()).toBe(403);
      expect((await drafts(chairH, block)).ok()).toBe(false);
      const draft = await post<Named>("/room-share/drafts", block, chairG);
      expect((await drafts(chairG, overlap)).status()).toBe(409);
      expect(((await (await request.get(`${API}/room-share/drafts`, { headers: secG })).json()) as Named[]).map((d) => d.id)).toContain(draft.id);
      expect((await request.post(`${API}/room-share/requests`, { headers: chairG, data: { draftIds: [draft.id] } })).status()).toBe(403);

      const [req] = await post<Named[]>("/room-share/requests", { draftIds: [draft.id], note: "e2e" }, secG);
      // the room is held while the request waits, and the host cannot unlock
      expect((await drafts(chairG, overlap)).status()).toBe(409);
      expect((await lockCall(false)).status()).toBe(400);

      // the badges: the room's chairman and the dean are waiting, the secretary is not yet
      const waiting = async (h: Record<string, string>) => ((await (await request.get(`${API}/room-share/requests/count`, { headers: h })).json()) as { count: number }).count;
      expect([await waiting(chairH), await waiting(secH!), await waiting(deanH), await waiting(chairG)]).toEqual([1, 0, 1, 0]);
      // the approver can see where the new block lands: the room's week, without the request's own block
      const placed = (await (await request.get(`${API}/room-share/requests/${req.id}`, { headers: chairH })).json()) as { roomBusy: { roomId: string; busy: unknown[] }[] };
      expect(placed.roomBusy.find((r) => r.roomId === made.room)?.busy).toEqual([]);

      // the dean only views; the secretary cannot go before the chairman; the guest cannot approve
      const detail = (await (await request.get(`${API}/room-share/requests/${req.id}`, { headers: deanH })).json()) as { blocks: unknown[]; actions: { chairmanDecides: boolean; secretaryDecides: boolean } };
      expect(detail.blocks.length).toBe(1);
      expect(detail.actions.chairmanDecides || detail.actions.secretaryDecides).toBe(false);
      for (const who of [deanH, secH, chairG]) expect((await request.post(`${API}/room-share/requests/${req.id}/approve`, { headers: who, data: {} })).status()).toBe(403);

      expect((await post<{ status: string }>(`/room-share/requests/${req.id}/approve`, {}, chairH, 200)).status).toBe("PENDING_SECRETARY");
      expect((await request.post(`${API}/room-share/requests/${req.id}/approve`, { headers: chairH, data: {} })).status()).toBe(403);
      expect([await waiting(chairH), await waiting(secH!)]).toEqual([0, 1]);
      expect((await post<{ status: string }>(`/room-share/requests/${req.id}/approve`, {}, secH, 200)).status).toBe("APPROVED");

      // the block is in the guest's schedule, in the host's room, and the host sees it too but cannot remove it
      const loadsOf = async (headers: Record<string, string>) => {
        const j = (await (await request.get(`${API}/faculty-loads?academicYearId=${ay.id}&semester=${SEM}`, { headers })).json()) as { id: string; roomId: string }[] | { items: { id: string; roomId: string }[] };
        return Array.isArray(j) ? j : j.items;
      };
      const mine = (await loadsOf(chairG)).filter((l) => l.roomId === made.room);
      expect(mine.length).toBe(1);
      made.loads.push(mine[0].id);
      expect((await loadsOf(chairH)).some((l) => l.id === mine[0].id)).toBe(true);
      expect((await request.delete(`${API}/faculty-loads/${mine[0].id}`, { headers: chairH })).ok()).toBe(false);
      expect((await drafts(chairG, overlap)).status()).toBe(409);
      expect((await lockCall(false)).status()).toBe(400);

      // the day and time are checked at once, before a class or subject is chosen
      const quick = async (startTime: string, endTime: string) =>
        ((await (await request.post(`${API}/room-share/drafts/preview`, { headers: chairG, data: { roomId: made.room, academicYearId: ay.id, semester: SEM, dayOfWeek: 1, startTime, endTime } })).json()) as { ok: boolean; problems: string[] });
      expect((await quick("7:30", "8:30")).ok).toBe(false);
      expect((await quick("10:00", "11:00")).ok).toBe(true);
      expect((await quick("9:00", "8:00")).ok).toBe(false);

      // the owner college can remove its own block again
      const del = await request.delete(`${API}/faculty-loads/${mine[0].id}`, { headers: chairG });
      expect(del.status(), await del.text()).toBe(204);
      made.loads.pop();
      expect((await lockCall(false)).status()).toBe(200);
      expect((await lockCall(true)).status()).toBe(200);

      // a rejected request frees its slot
      const d2 = await post<Named>("/room-share/drafts", { ...block, dayOfWeek: 2 }, chairG);
      const [req2] = await post<Named[]>("/room-share/requests", { draftIds: [d2.id] }, secG);
      await post(`/room-share/requests/${req2.id}/reject`, { notes: "No." }, chairH, 200);
      const host = (await (await request.get(`${API}/room-share/requests?side=host`, { headers: chairH })).json()) as { id: string; status: string }[];
      expect(host.find((r) => r.id === req2.id)?.status).toBe("REJECTED");
    } finally {
      for (const id of made.loads) {
        const c = await request.post(`${API}/auth/login`, { data: { email: `rschairg${stamp}@coe.vantage`, password: PASSWORD } });
        if (c.ok()) await request.delete(`${API}/faculty-loads/${id}`, { headers: { Authorization: `Bearer ${((await c.json()) as { accessToken: string }).accessToken}` } });
      }
      if (secH) await request.put(`${API}/academic-years/${ay.id}/term-lock`, { headers: secH, data: { semester: SEM, locked: false } });
      for (const id of made.users) await request.delete(`${API}/users/${id}`, { headers: admin });
      for (const [path, id] of [["/student-classes", made.cls], ["/subjects", made.subj], ["/curriculum", made.curr], ["/rooms", made.room]]) if (id) await request.delete(`${API}${path}/${id}`, { headers: admin });
      for (const id of made.depts) await request.delete(`${API}/departments/${id}`, { headers: admin });
      for (const id of made.colleges) await request.delete(`${API}/colleges/${id}`, { headers: admin });
    }
  });

  test("the Room sharing page opens for a chairman and the About page lists it", async ({ browser }) => {
    const page = await browserLogin(browser, "chairman@coe.vantage");
    await page.getByRole("link", { name: "Room sharing" }).click();
    await expect(page.getByRole("heading", { name: "Room sharing", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Available rooms" })).toBeVisible();
    await page.getByRole("tab", { name: "Requests" }).click();
    await expect(page.getByRole("button", { name: "Asked of us" })).toBeVisible();
    await page.goto("/about");
    await expect(page.getByText("Room sharing: once a college locks a semester")).toBeVisible();
    await page.context().close();
  });
});

test.describe("scheduler: raw blocks", () => {
  test("a block before 7 AM keeps the grid reaching back to it and can be removed from the Code list", async ({ page, request }) => {
    const login = await request.post(`${API}/auth/login`, { data: { email: "chairman@coe.vantage", password: PASSWORD } });
    const headers = { Authorization: `Bearer ${((await login.json()) as { accessToken: string }).accessToken}` };
    const get = async <T>(path: string) => (await (await request.get(`${API}${path}`, { headers })).json()) as T;
    const ay = await get<{ id: string }>("/academic-years/active");
    const cls = (await get<{ id: string; name: string }[]>("/student-classes")).find((c) => c.name === "BS CE 4A");
    const subject = (await get<{ id: string; code: string }[]>("/subjects")).find((s) => s.code === "CE101");
    test.skip(!cls || !subject, "needs the seeded CE data");
    const made = await request.post(`${API}/faculty-loads`, {
      headers,
      data: { subjectId: subject!.id, studentClassId: cls!.id, facultyDisplayName: "Raw Probe", roomDisplayName: "Probe", dayOfWeek: 6, startTime: "5:00", endTime: "6:00", semester: 1, academicYearId: ay.id },
    });
    expect(made.ok(), await made.text()).toBeTruthy();
    const id = ((await made.json()) as { id: string }).id;
    try {
      await login_(page, "chairman@coe.vantage");
      await page.goto("/scheduler");
      await page.getByRole("combobox", { name: /Student Class|class/i }).first().click();
      await page.getByRole("option", { name: "BS CE 4A" }).first().click();

      // the grid reaches back to 5 AM
      await expect(page.getByText("5:00 AM", { exact: true }).first()).toBeVisible();

      await page.getByRole("button", { name: "Edit blocks as a list" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText("odd hour").first()).toBeVisible();
      const row = dialog.getByRole("row").filter({ hasText: "Raw Probe" });
      await row.getByRole("button", { name: "Remove" }).click();
      await row.getByRole("button", { name: "Remove?" }).click();
      await expect(dialog.getByRole("row").filter({ hasText: "Raw Probe" })).toHaveCount(0);
      const left = await get<{ id: string }[]>(`/faculty-loads?studentClassId=${cls!.id}&academicYearId=${ay.id}&semester=1`);
      expect(left.some((l) => l.id === id)).toBe(false);
    } finally {
      await request.delete(`${API}/faculty-loads/${id}`, { headers });
    }
  });
});
