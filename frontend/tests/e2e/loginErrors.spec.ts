import { test, expect } from "@playwright/test";
import { PASSWORD } from "./support";

test.describe("login form errors", () => {
  test("empty fields, missing password, bad email, and autofill without change events", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/login");
    const signIn = page.getByRole("button", { name: "Sign in" });

    await signIn.click();
    await expect(page.getByText("Enter your email and password to sign in.")).toBeVisible();
    await expect(page.getByText("Email is required")).toBeVisible();
    await expect(page.getByText("Password is required")).toBeVisible();
    await expect(page.getByText("Please fix the errors below.")).toHaveCount(0);
    await expect(page.locator("#email")).toBeFocused();

    await page.locator("#email").fill("not-an-email");
    await page.locator("#password").fill("x");
    await signIn.click();
    await expect(page.getByText("Check your email address and try again.")).toBeVisible();

    await page.locator("#email").fill("admin@coe.vantage");
    await page.locator("#password").fill("");
    await signIn.click();
    await expect(page.getByText("Enter your password to sign in.")).toBeVisible();
    await expect(page.locator("#password")).toBeFocused();

    // Autofill: set the values without firing input/change events, so React state stays empty.
    await page.evaluate((pw) => {
      const set = (id: string, value: string) => {
        const el = document.getElementById(id) as HTMLInputElement;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
      };
      set("email", "admin@coe.vantage");
      set("password", pw);
    }, PASSWORD);
    await signIn.click();
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
  });
});
