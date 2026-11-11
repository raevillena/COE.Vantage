import { test, expect } from "@playwright/test";
import { CE_CLASS, ensureCeClass, removeCeClass, login } from "./support";

test("on a wide screen the left and right Scheduler panes take the height of the middle pane and scroll inside it", async ({ page, request }) => {
  test.setTimeout(60_000);
  await ensureCeClass(request);
  try {
    await page.setViewportSize({ width: 2000, height: 1000 });
    await login(page, "chairman@coe.vantage");
    await page.goto("/scheduler");
    await page.getByText("Select class").first().click();
    await page.getByRole("option", { name: CE_CLASS }).click();
    await expect(page.getByRole("heading", { name: /^Class schedule/ })).toBeVisible();
    await page.waitForTimeout(500);
    const box = async (name: "left" | "middle" | "right") => (await page.getByTestId(`scheduler-pane-${name}`).boundingBox())!;
    const [left, mid, right] = [await box("left"), await box("middle"), await box("right")];
    expect(Math.abs(left.height - mid.height)).toBeLessThan(2);
    expect(Math.abs(right.height - mid.height)).toBeLessThan(2);

    // a much taller side pane does not stretch the row: it scrolls inside
    await page.evaluate(() => {
      const inner = document.querySelector("[data-testid=scheduler-pane-right]")!.firstElementChild as HTMLElement;
      const filler = document.createElement("div");
      filler.style.height = "3000px";
      filler.style.flexShrink = "0";
      inner.appendChild(filler);
    });
    const midAfter = await box("middle");
    const rightAfter = await box("right");
    expect(Math.abs(midAfter.height - mid.height)).toBeLessThan(2);
    expect(Math.abs(rightAfter.height - midAfter.height)).toBeLessThan(2);
    expect(await page.evaluate(() => { const el = document.querySelector("[data-testid=scheduler-pane-right]")!.firstElementChild as HTMLElement; return el.scrollHeight > el.clientHeight; })).toBe(true);
  } finally {
    await removeCeClass(request);
  }
});
