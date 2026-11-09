import type { Page } from "@playwright/test";

/** Shared by the e2e specs. They run against an already running stack (backend :4000, frontend :5173, seeded database). */
export const PASSWORD = process.env.E2E_PASSWORD ?? "Test123!";
export const API = process.env.E2E_API_URL ?? "http://localhost:4000";

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
}
