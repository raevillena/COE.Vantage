import { test, expect } from "@playwright/test";
import { login } from "./support";

const PAGES = [
  "/dashboard",
  "/deadlines",
  "/users",
  "/rooms",
  "/curriculum",
  "/subjects",
  "/student-classes",
  "/departments",
  "/academic-years",
  "/requests",
  "/room-sharing",
  "/scheduler",
  "/schedules/faculty",
  "/schedules/student-class",
  "/schedules/rooms",
  "/audit-log",
  "/trash",
  "/ge-subjects",
  "/exam-rooms",
];

test.describe("page data reload", () => {
  test("every data page has an icon-only Reload in its header", async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, "admin@coe.vantage");
    for (const path of PAGES) {
      await page.goto(path);
      const reload = page.locator("main").getByTestId("page-reload"); // in the page header, not the app bar
      await expect(reload, path).toBeVisible();
      await expect(reload, path).toHaveAccessibleName("Reload page data");
      expect((await reload.innerText()).trim(), `${path} has no text`).toBe("");
    }
  });

  test("clicking it fetches the page's data again, and keeps the filters", async ({ page }) => {
    await login(page, "admin@coe.vantage");
    await page.goto("/users");
    await expect(page.getByTestId("user-filters")).toBeVisible();
    await page.getByPlaceholder(/Search by name/).fill("faculty");
    const refetch = page.waitForResponse((r) => r.url().endsWith("/users") && r.request().method() === "GET");
    await page.getByTestId("page-reload").click();
    expect((await refetch).status()).toBe(200);
    await expect(page.getByPlaceholder(/Search by name/)).toHaveValue("faculty");
  });

  test("the dashboard reload fetches its summary again", async ({ page }) => {
    await login(page, "admin@coe.vantage");
    await page.goto("/dashboard");
    await expect(page.getByTestId("page-reload")).toBeVisible();
    await page.waitForResponse((r) => r.url().includes("/dashboard/summary"));
    const again = page.waitForResponse((r) => r.url().includes("/dashboard/summary"));
    await page.getByTestId("page-reload").click();
    expect((await again).status()).toBe(200);
  });
});
