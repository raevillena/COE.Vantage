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
