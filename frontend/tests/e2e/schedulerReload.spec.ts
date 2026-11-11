import { test, expect } from "@playwright/test";
import { CE_CLASS, ensureCeClass, removeCeClass, login } from "./support";

test("the Scheduler Reload button, before Block colors, fetches the schedule again", async ({ page, request }) => {
  test.setTimeout(60_000);
  await ensureCeClass(request);
  try {
    await login(page, "chairman@coe.vantage");
    await page.goto("/scheduler");
    await page.getByText("Select class").first().click();
    await page.getByRole("option", { name: CE_CLASS }).click();
    await expect(page.getByRole("button", { name: /Block colors/ })).toBeVisible();
    const reload = page.getByRole("button", { name: "Reload schedule" });
    await expect(reload).toBeVisible();
    const refetch = page.waitForResponse((r) => r.url().includes("/faculty-loads?") && r.request().method() === "GET");
    await reload.click();
    expect((await refetch).status()).toBe(200);
    await expect(reload).toBeEnabled();
  } finally {
    await removeCeClass(request);
  }
});
