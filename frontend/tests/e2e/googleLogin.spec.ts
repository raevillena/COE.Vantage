import { test, expect } from "@playwright/test";
import { API } from "./support";

test.describe("google sign-in", () => {
  test("the endpoints refuse a bad token, and the button only shows when the server has a client id", async ({ page, request }) => {
    const config = (await (await request.get(`${API}/auth/google/config`)).json()) as { enabled: boolean; domain: string };
    expect(config.domain).toBe("mmsu.edu.ph");
    const bad = await request.post(`${API}/auth/google`, { data: { credential: "x".repeat(40) } });
    expect([400, 401]).toContain(bad.status()); // 400 when Google is not set up, 401 when the token fails verification
    expect((await request.post(`${API}/auth/google`, { data: {} })).status()).toBe(400);
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByText(/Only for existing accounts with an @mmsu\.edu\.ph email/)).toHaveCount(config.enabled ? 1 : 0);
  });

  test("a refused Google sign-in comes back as an error on the login page instead of an expired-session redirect", async ({ page }) => {
    await page.route("**/auth/google", (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "No Vantage account uses someone@mmsu.edu.ph. Ask an administrator to add it." }) })
    );
    await page.goto("/login");
    const result = await page.evaluate(async () => {
      const { apiClient } = await import("/src/api/apiClient.ts");
      try {
        await apiClient.post("/auth/google", { credential: "x".repeat(40) });
        return "no error";
      } catch (e) {
        return (e as { response?: { status?: number } }).response?.status ?? "other";
      }
    });
    expect(result).toBe(401);
    await page.waitForTimeout(500);
    expect(new URL(page.url()).pathname).toBe("/login");
    await expect(page.getByText("Your session has expired")).toHaveCount(0);
  });
});
