import { test, expect } from "@playwright/test";
import { CE_CLASS, ensureCeClass, removeCeClass, login } from "./support";

test("a subject dropped on a day starts the assignment on that day and time, not on Monday", async ({ page, request }) => {
  test.setTimeout(90_000);
  await ensureCeClass(request);
  try {
    await page.setViewportSize({ width: 1400, height: 1500 });
    await login(page, "chairman@coe.vantage");
    await page.goto("/scheduler");
    await page.getByText("Select class").first().click();
    await page.getByRole("option", { name: CE_CLASS }).click();
    await page.waitForTimeout(800);

    const header = (await page.getByText("Thu", { exact: true }).first().boundingBox())!;
    const card = (await page.getByText("CE401").first().boundingBox())!;
    const target = { x: header.x + header.width / 2, y: 469 };
    await page.mouse.move(card.x + 20, card.y + 8);
    await page.mouse.down();
    for (let i = 1; i <= 20; i += 1) {
      await page.mouse.move(card.x + 20 + ((target.x - card.x - 20) * i) / 20, card.y + 8 + ((target.y - card.y - 8) * i) / 20);
      await page.waitForTimeout(25);
    }
    await page.mouse.up();
    await expect(page.getByLabel("Day of week").first()).toContainText("Thu");
    // it keeps the dropped day after a faculty is picked (no jump to the first free slot)
    const facultyBox = page.getByRole("combobox", { name: "Faculty", exact: true });
    await facultyBox.click();
    await facultyBox.fill("santos");
    await page.getByRole("option", { name: /Santos/ }).first().click();
    await page.waitForTimeout(1500);
    await expect(page.getByLabel("Day of week").first()).toContainText("Thu");
  } finally {
    await removeCeClass(request);
  }
});
