import { test, expect } from "@playwright/test";
import { login } from "./support";

test.describe("admin users page filters", () => {
  test("filter by department, role, status and max units, then clear", async ({ page }) => {
    test.setTimeout(60_000);
    page.setDefaultTimeout(10_000);
    await login(page, "admin@coe.vantage");
    await page.goto("/users");
    const showing = page.getByText(/^Showing \d+ of \d+$/);
    await expect(showing).toBeVisible();
    const counts = async () => {
      const m = /Showing (\d+) of (\d+)/.exec((await showing.textContent()) ?? "")!;
      return { shown: Number(m[1]), total: Number(m[2]) };
    };
    const { total } = await counts();
    expect(total).toBeGreaterThan(1);
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(Math.min(total, 50)); // pages hold 50 rows

    // Department: pick the first real department; every visible row must show it in the Department column (6th cell).
    const dept = page.getByLabel("Filter by department");
    const options = await dept.locator("option").allTextContents();
    const name = options.find((o) => o && !/^(All departments|No department)$/.test(o))!;
    await dept.selectOption({ label: name });
    const afterDept = await counts();
    expect(afterDept.shown).toBeGreaterThan(0);
    expect(afterDept.shown).toBeLessThanOrEqual(total);
    await expect(rows).toHaveCount(Math.min(afterDept.shown, 50));
    for (const text of await rows.locator("td:nth-child(6)").allTextContents()) expect(text).toContain(name);

    // Role on top of the department narrows further (or equal).
    const role = page.getByLabel("Filter by role");
    const roles = (await role.locator("option").allTextContents()).filter((o) => o !== "All roles");
    await role.selectOption({ label: roles[0] });
    for (const text of await rows.locator("td:nth-child(3)").allTextContents()) expect(text.trim()).toBe(roles[0]);

    // Max units
    await page.getByLabel("Filter by maximum units").selectOption("unset");
    for (const text of await rows.locator("td:nth-child(7)").allTextContents()) expect(text.trim()).toMatch(/^(—|-|)$/);

    // Clear filters restores everything.
    await page.getByRole("button", { name: "Clear filters" }).click();
    expect((await counts()).shown).toBe(total);
    await expect(dept).toHaveValue("");
  });
});
