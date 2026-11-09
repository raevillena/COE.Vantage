import { expect, test } from "@playwright/test";
import { API, PASSWORD, login } from "./support";

/**
 * Grades area: the MMSU Grade Push page, the staff Grades page (layout, columns, terms, grade keys, import) and the
 * public grade lookup. Every test makes its own "QA ..." subjects with made-up students and deletes them in `finally`.
 * Run just this file: npx playwright test tests/e2e/grades.spec.ts
 */

test.describe("MMSU grade push module", () => {
  test("is off until switched on, then shows the setup page and serves the extension zip", async ({ page, request }) => {
    const auth = await request.post(`${API}/auth/login`, { data: { email: "chairman@coe.vantage", password: PASSWORD } });
    const headers = { Authorization: `Bearer ${((await auth.json()) as { accessToken: string }).accessToken}` };
    const original = (await (await request.get(`${API}/auth/me/experimental-features`, { headers })).json()) as { enabled: boolean; features: string[] };
    const set = (data: object) => request.patch(`${API}/auth/me/experimental-features`, { headers, data });
    try {
      // Off: the page is not offered and a typed URL goes back to the profile.
      expect((await set({ enabled: true, features: original.features.filter((f) => f !== "mmsuGradePush") })).status()).toBe(200);
      await login(page, "chairman@coe.vantage");
      await expect(page.getByRole("link", { name: "MMSU Grade Push" })).toHaveCount(0);
      await page.goto("/experimental/mmsu-grade-push");
      await page.waitForURL("**/profile");

      // On: listed in the sidebar and the page explains setup and use.
      const on = await set({ enabled: true, features: Array.from(new Set([...original.features, "mmsuGradePush"])) });
      expect(on.status(), await on.text()).toBe(200);
      await page.context().clearCookies();
      await page.evaluate(() => sessionStorage.clear());
      await login(page, "chairman@coe.vantage");
      await page.getByRole("link", { name: "MMSU Grade Push" }).click();
      await expect(page.getByRole("heading", { name: "MMSU Grade Push", level: 1 })).toBeVisible();
      await expect(page.getByRole("heading", { name: "1. Get the extension" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "2. Use it on a gradesheet" })).toBeVisible();
      const link = page.getByRole("link", { name: /Download extension/ });
      await expect(link).toHaveAttribute("href", "/downloads/vantage-mmsu-grade-push.zip");

      // The pictures in the steps load (not broken links).
      const pictures = page.locator('img[src^="/guides/mmsu-grade-push/"]');
      await expect(pictures).toHaveCount(6);
      for (const picture of await pictures.all()) {
        await picture.scrollIntoViewIfNeeded();
        await expect.poll(() => picture.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      }
      await expect(page.getByRole("link", { name: /Grade Sheet list \(opens in a new tab\)/ })).toHaveAttribute("target", "_blank");

      const zip = await page.request.get("/downloads/vantage-mmsu-grade-push.zip");
      expect(zip.status()).toBe(200);
      const bytes = await zip.body();
      expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
      expect(bytes.includes(Buffer.from("manifest.json"))).toBe(true);
    } finally {
      await set({ enabled: original.enabled, features: original.features });
    }
  });
});

test.describe("grades module layout", () => {
  test("the roster grid keeps frozen cells opaque, leaves room to scroll, and fits narrow screens", async ({ browser, request }) => {
    test.setTimeout(150_000);
    const auth = await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } });
    const headers = { Authorization: `Bearer ${((await auth.json()) as { accessToken: string }).accessToken}` };
    const prefs = (await (await request.get(`${API}/auth/me/experimental-features`, { headers })).json()) as { enabled: boolean; features: string[] };
    const keys = ["Quiz 1", "Quiz 2", "Quiz 3", "Quiz 4", "Quiz 5", "Quiz 6", "Midterm", "Finals", "Laboratory Exercise 12 Practical"];
    let subjectId = "";
    try {
      await request.patch(`${API}/auth/me/experimental-features`, { headers, data: { enabled: true, features: Array.from(new Set([...prefs.features, "gradeModule"])) } });
      const created = await request.post(`${API}/grade-subjects`, { headers, data: { name: "QA Layout Check", code: "QA-101" } });
      subjectId = ((await created.json()) as { id: string }).id;
      await request.patch(`${API}/grade-subjects/${subjectId}`, {
        headers,
        data: {
          gradingSystem: {
            passingGrade: 75,
            gradeEquivalence: [
              { minPercent: 75, maxPercent: 100, letter: "1", remarks: "PASSED" },
              { minPercent: 50, maxPercent: 74.99, letter: "4", remarks: "CND" },
              { minPercent: 0, maxPercent: 49.99, letter: "5", remarks: "FAILED" },
            ],
            categories: [{ name: "All", weight: 100, components: [{ name: "All", weight: 100, gradeKeys: keys }] }],
          },
        },
      });
      const scores = (v: number) => Object.fromEntries(keys.map((k) => [k, v]));
      const people: [string, string, string, number][] = [
        ["DELA CRUZ-ALCANTARA, MARIA CRISTINA SANTOS-REYES", "23-050001", "very.long.email.address.for.layout.testing@engineering.example.edu.ph", 95],
        ["BRAVO, BEN", "23-050002", "ben@example.com", 60],
        ["CHARLIE, CARLA", "23-050003", "carla@example.com", 30],
      ];
      // Enough students that the table scrolls vertically too. One bulk import (it replaces the subject's records).
      const records = [
        ...people.map(([studentName, studentNumber, email, v]) => ({ studentName, studentNumber, email, grades: scores(v), maxScores: scores(100) })),
        ...Array.from({ length: 40 }, (_, i) => ({
          studentName: `FILLER${String(i + 1).padStart(2, "0")}, TEST`,
          studentNumber: `99-7${String(i + 1).padStart(5, "0")}`,
          email: null,
          grades: scores(50 + (i % 50)),
          maxScores: scores(100),
        })),
      ];
      const imported = await request.post(`${API}/grade-subjects/${subjectId}/records/import`, { headers, data: { records } });
      expect(imported.status(), await imported.text()).toBe(201);
      await request.post(`${API}/grade-subjects/${subjectId}/compute-grades`, { headers });

      const measure = async (width: number, height: number, scheme: "light" | "dark" = "light") => {
        const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme });
        const page = await context.newPage();
        page.setDefaultTimeout(10_000);
        await login(page, "admin@coe.vantage");
        await page.goto("/experimental/grades");
        await page.getByRole("button", { name: "QA Layout Check" }).click();
        await expect(page.getByText("Showing 43 of 43")).toBeVisible();
        const result = await page.evaluate(() => {
          const rect = (e: Element) => e.getBoundingClientRect();
          const alpha = (css: string) => {
            const m = /rgba?\([^)]*,\s*([\d.]+)\)/.exec(css) ?? /\/\s*([\d.]+%?)\s*\)/.exec(css);
            if (!m) return 1;
            return m[1].endsWith("%") ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
          };
          const wrap = document.querySelector("div.overflow-x-auto") as HTMLElement;
          const sticky = (cells: Element[]) => cells.filter((c) => getComputedStyle(c).position === "sticky") as HTMLElement[];
          const headCells = sticky(Array.from(document.querySelectorAll("thead th")));
          const bodyCells = sticky(Array.from(document.querySelectorAll("tbody tr:first-child td")));
          const left = headCells.filter((c) => getComputedStyle(c).left !== "auto");
          const right = headCells.filter((c) => getComputedStyle(c).right !== "auto");
          const width = (cells: HTMLElement[]) => Math.round(cells.reduce((sum, c) => sum + rect(c).width, 0));
          const overlaps: string[] = [];
          for (const group of [left, right]) {
            const sorted = [...group].sort((a, b) => rect(a).left - rect(b).left);
            for (let i = 1; i < sorted.length; i++) if (rect(sorted[i - 1]).right - rect(sorted[i]).left > 0.5) overlaps.push(sorted[i].textContent?.trim() ?? "");
          }
          const buttons = Array.from(document.querySelectorAll("tbody tr:first-child td:first-child button"));
          const workspace = wrap.closest("section") as HTMLElement;
          return {
            // Every header cell is pinned to the top; the frozen columns are the ones also pinned to a side.
            frozen: left.length + right.length,
            translucentFrozen: bodyCells.filter((c) => alpha(getComputedStyle(c).backgroundColor) < 1).map((c) => c.textContent?.trim().slice(0, 12) ?? ""),
            room: Math.round(rect(wrap).width - width(left) - width(right)),
            overlaps,
            actionRows: new Set(buttons.map((b) => Math.round(rect(b).top))).size,
            workspaceWidth: Math.round(rect(workspace).width),
            pageWidth: document.documentElement.scrollWidth,
            viewport: window.innerWidth,
          };
        });
        return { context, page, result };
      };

      for (const [width, height] of [[1440, 900], [1280, 800]]) {
        const { context, page, result } = await measure(width, height);
        expect(result.frozen, `frozen columns at ${width}`).toBe(1);
        expect(result.translucentFrozen, `see-through frozen cells at ${width}`).toEqual([]);
        expect(result.overlaps, `overlapping frozen columns at ${width}`).toEqual([]);
        expect(result.actionRows, `row action buttons on one line at ${width}`).toBe(1);
        expect(result.room, `room left for scrolling scores at ${width}`).toBeGreaterThan(150);
        // Score column headers wrap to show their full name inside the compact 4.5rem column: never cut off, never wider.
        const heads = await page.evaluate(() =>
          Array.from(document.querySelectorAll("thead th"))
            .filter((th) => /^(Quiz 1|Laboratory Exercise 12 Practical)$/.test((th.textContent ?? "").trim()))
            .map((th) => ({
              text: (th.textContent ?? "").trim(),
              width: Math.round(th.getBoundingClientRect().width),
              textHeight: Math.round(th.querySelector("span")!.getBoundingClientRect().height),
              clipped: th.scrollWidth > th.clientWidth + 1,
              ellipsis: getComputedStyle(th.querySelector("span")!).textOverflow === "ellipsis",
            }))
        );
        expect(heads.map((h) => h.text).sort()).toEqual(["Laboratory Exercise 12 Practical", "Quiz 1"]);
        for (const h of heads) {
          expect(h.width, `${h.text} column width at ${width}`).toBe(72);
          expect(h.clipped, `${h.text} header clipped at ${width}`).toBe(false);
          expect(h.ellipsis, `${h.text} header truncated at ${width}`).toBe(false);
        }
        const long = heads.find((h) => h.text.startsWith("Laboratory"))!;
        const short = heads.find((h) => h.text === "Quiz 1")!;
        expect(long.textHeight, "the long header wraps onto more lines").toBeGreaterThan(short.textHeight);
        // Student names are shown in full (wrapping onto more lines), never cut off with an ellipsis.
        const nameCell = await page.evaluate(() => {
          const cell = Array.from(document.querySelectorAll("tbody tr td:first-child div.min-w-0")).find((d) => (d.textContent ?? "").startsWith("DELA CRUZ")) as HTMLElement;
          const quick = Array.from(document.querySelectorAll("tbody tr td:first-child div.min-w-0")).find((d) => (d.textContent ?? "").startsWith("BRAVO")) as HTMLElement;
          return {
            text: cell.textContent,
            clipped: cell.scrollWidth > cell.clientWidth + 1 || cell.scrollHeight > cell.clientHeight + 1,
            ellipsis: getComputedStyle(cell).textOverflow === "ellipsis",
            longHeight: Math.round(cell.getBoundingClientRect().height),
            shortHeight: Math.round(quick.getBoundingClientRect().height),
          };
        });
        expect(nameCell.text).toBe("DELA CRUZ-ALCANTARA, MARIA CRISTINA SANTOS-REYES");
        expect(nameCell.clipped, `a student name is clipped at ${width}`).toBe(false);
        expect(nameCell.ellipsis, `a student name is truncated at ${width}`).toBe(false);
        expect(nameCell.longHeight, "the long name wraps onto more lines").toBeGreaterThan(nameCell.shortHeight);
        // The table box has a bounded height and its own vertical scroll: the header row stays pinned while rows scroll under
        // it, and the box's bottom edge (with its horizontal scrollbar) fits on screen once the page is scrolled to it.
        const box = page.locator("div.overflow-x-auto");
        await box.scrollIntoViewIfNeeded();
        const boxInfo = await page.evaluate(() => {
          const el = document.querySelector("div.overflow-x-auto") as HTMLElement;
          const rect = el.getBoundingClientRect();
          return { height: Math.round(rect.height), bottom: Math.round(rect.bottom), overflowsY: el.scrollHeight > el.clientHeight + 1, viewport: window.innerHeight };
        });
        expect(boxInfo.overflowsY, `the table scrolls vertically at ${width}`).toBe(true);
        expect(boxInfo.height, `table box height at ${width}`).toBeLessThanOrEqual(Math.ceil(boxInfo.viewport * 0.76));
        expect(boxInfo.bottom, `the table's bottom scrollbar is on screen at ${width}`).toBeLessThanOrEqual(boxInfo.viewport + 1);
        await box.evaluate((el) => {
          el.scrollTop = 400;
        });
        const pinned = await page.evaluate(() => {
          const el = document.querySelector("div.overflow-x-auto") as HTMLElement;
          const head = document.querySelector("thead th:nth-child(1)")!.getBoundingClientRect();
          return { scrolled: Math.round(el.scrollTop), headTop: Math.round(head.top), boxTop: Math.round(el.getBoundingClientRect().top) };
        });
        expect(pinned.scrolled, "the box really scrolled").toBeGreaterThan(300);
        expect(Math.abs(pinned.headTop - pinned.boxTop), `header row stays pinned at ${width}`).toBeLessThanOrEqual(2);
        await box.evaluate((el) => {
          el.scrollTop = 0;
        });
        // A scrollbar sits above the headers and drives the table (no trip to the bottom to scroll sideways).
        const strip = page.getByTestId("grid-top-scrollbar");
        await expect(strip).toBeVisible();
        const above = await page.evaluate(() => {
          const top = document.querySelector('[data-testid="grid-top-scrollbar"]')!.getBoundingClientRect();
          const head = document.querySelector("thead")!.getBoundingClientRect();
          return top.bottom <= head.top + 1;
        });
        expect(above, `scrollbar above the headers at ${width}`).toBe(true);
        // The bar is sized from the table once it has rendered; wait until it actually has somewhere to scroll.
        await expect.poll(() => strip.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(300);
        await strip.evaluate((el) => {
          el.scrollLeft = 250;
        });
        await expect
          .poll(() => page.evaluate(() => Math.round((document.querySelector("div.overflow-x-auto") as HTMLElement).scrollLeft)))
          .toBeGreaterThan(200);
        // ...and the other way round.
        await page.evaluate(() => {
          (document.querySelector("div.overflow-x-auto") as HTMLElement).scrollLeft = 60;
        });
        await expect.poll(() => strip.evaluate((el) => Math.round(el.scrollLeft))).toBeLessThan(100);
        await page.evaluate(() => {
          const wrap = document.querySelector("div.overflow-x-auto") as HTMLElement;
          wrap.scrollLeft = wrap.scrollWidth;
        });
        await page.screenshot({ path: `tests/e2e/.results/grades-layout-${width}.png` });
        await context.close();
      }

      // Narrower than the frozen layout needs: plain horizontal scrolling, no frozen columns, and the page itself must not grow.
      for (const width of [1024, 768, 390]) {
        const { context, result } = await measure(width, 900);
        expect(result.frozen, `no frozen columns at ${width}`).toBe(0);
        expect(result.workspaceWidth, `workspace wider than the screen at ${width}`).toBeLessThanOrEqual(width);
        expect(result.pageWidth, `page scrolls sideways at ${width}`).toBeLessThanOrEqual(width);
        await context.close();
      }

      // Dark mode: frozen cells are opaque there too.
      const dark = await measure(1440, 900, "dark");
      expect(dark.result.translucentFrozen).toEqual([]);
      await dark.page.screenshot({ path: "tests/e2e/.results/grades-layout-dark.png" });

      // The Add record dialog starts with the subject's own grade columns.
      await dark.page.getByRole("button", { name: "Add record" }).click();
      const dialog = dark.page.getByRole("dialog");
      for (const key of keys) await expect(dialog.getByText(key, { exact: true })).toBeVisible();
      await dark.context.close();
    } finally {
      if (subjectId) await request.delete(`${API}/grade-subjects/${subjectId}`, { headers });
      await request.patch(`${API}/auth/me/experimental-features`, { headers, data: { enabled: prefs.enabled, features: prefs.features } });
    }
  });
});

test.describe("grade terms", () => {
  test("students open on the latest semester and can filter by year and semester; staff filter and set the term", async ({ browser, request }) => {
    test.setTimeout(150_000);
    const auth = await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } });
    const headers = { Authorization: `Bearer ${((await auth.json()) as { accessToken: string }).accessToken}` };
    const prefs = (await (await request.get(`${API}/auth/me/experimental-features`, { headers })).json()) as { enabled: boolean; features: string[] };
    const allYears = (await (await request.get(`${API}/academic-years/for-schedules`, { headers })).json()) as { id: string; name: string }[];
    const rank = (name: string) => Number(/\d{4}/.exec(name)?.[0] ?? 0);
    const years = [...allYears].sort((a, b) => rank(b.name) - rank(a.name));
    test.skip(years.length < 2, "needs two academic years");
    const [newest, older] = years;

    const STUDENT = "99-777001";
    const CODE = "TERMCODE1";
    const made: string[] = [];
    // The student page opens on the college's Current Semester when the student has grades in it, otherwise on the latest
    // term. This test is about the latest term, so the Current Semester is moved to one the student has nothing in.
    const COE_ID = "00000000-0000-0000-0000-0000000000a2";
    const collegesNow = (await (await request.get(`${API}/colleges`, { headers })).json()) as { id: string; calendarAcademicYearId: string | null; calendarSemester: number | null }[];
    const calendarBefore = collegesNow.find((c) => c.id === COE_ID)!;
    const setCurrent = (academicYearId: string | null, semester?: number) =>
      request.put(`${API}/academic-years/current-term`, { headers, data: { kind: "current", academicYearId, semester, collegeId: COE_ID } });
    const subject = async (name: string, term: { academicYearId: string; semester: number } | null) => {
      const created = await request.post(`${API}/grade-subjects`, { headers, data: { name, ...(term ?? {}) } });
      expect(created.status(), await created.text()).toBe(201);
      const id = ((await created.json()) as { id: string }).id;
      made.push(id);
      return id;
    };
    const record = async (subjectId: string, studentNumber: string, code: string, score: number) => {
      const r = await request.post(`${API}/grade-subjects/${subjectId}/records`, { headers, data: { studentName: "TERM, TESTER", studentNumber, code, grades: { "Quiz 1": score }, maxScores: { "Quiz 1": 100 } } });
      expect(r.status(), await r.text()).toBe(201);
    };
    try {
      await request.patch(`${API}/auth/me/experimental-features`, { headers, data: { enabled: true, features: Array.from(new Set([...prefs.features, "gradeModule"])) } });
      expect((await setCurrent(years[years.length - 1].id, 1)).status()).toBe(200);
      const olderSecond = await subject("QA Term Older 2nd", { academicYearId: older.id, semester: 2 });
      const newestFirst = await subject("QA Term Newest 1st", { academicYearId: newest.id, semester: 1 });
      const newestSecond = await subject("QA Term Newest 2nd", { academicYearId: newest.id, semester: 2 });
      const undated = await subject("QA Term Undated", null);
      for (const [id, score] of [[olderSecond, 71], [newestFirst, 82], [newestSecond, 93], [undated, 64]] as [string, number][]) await record(id, STUDENT, CODE, score);
      await record(undated, "99-777002", "ONLYUNDATED", 50);

      // ---- the student's page ----
      const publicContext = await browser.newContext({ viewport: { width: 390, height: 900 } });
      const pub = await publicContext.newPage();
      pub.setDefaultTimeout(10_000);
      await pub.goto(`/grades?studentNumber=${STUDENT}&code=${CODE}`);
      const yearSelect = pub.getByLabel("Academic year");
      const semesterSelect = pub.getByLabel("Semester");
      const card = (name: string) => pub.getByRole("heading", { name, level: 3 });

      // Opens on the latest semester that has grades.
      await expect(yearSelect).toHaveValue(newest.id);
      await expect(semesterSelect).toHaveValue("2");
      await expect(pub.getByRole("status")).toContainText(`Showing 2nd Sem · ${newest.name} (latest term) — 1 subject. 3 more in other terms.`);
      await expect(card("QA Term Newest 2nd")).toBeVisible();
      // Each item shows its score out of the most it could score.
      await expect(pub.getByText("93 / 100", { exact: true })).toBeVisible();
      for (const other of ["QA Term Newest 1st", "QA Term Older 2nd", "QA Term Undated"]) await expect(card(other)).toHaveCount(0);
      await pub.screenshot({ path: "tests/e2e/.results/grade-terms-public-latest.png", fullPage: true });

      // Another semester of the same year.
      await semesterSelect.selectOption("1");
      await expect(card("QA Term Newest 1st")).toBeVisible();
      await expect(card("QA Term Newest 2nd")).toHaveCount(0);

      // Another year lands on that year's latest semester.
      await yearSelect.selectOption(older.id);
      await expect(semesterSelect).toHaveValue("2");
      await expect(card("QA Term Older 2nd")).toBeVisible();

      // Every term: grouped newest first, the latest marked, subjects without a term last.
      await yearSelect.selectOption("all");
      const headings = await pub.getByRole("heading", { level: 2 }).allTextContents();
      expect(headings.map((h) => h.replace("Latest", "").trim()).filter((h) => h !== "Grade Lookup")).toEqual([
        `2nd Sem · ${newest.name}`,
        `1st Sem · ${newest.name}`,
        `2nd Sem · ${older.name}`,
        "No term set",
      ]);
      await expect(pub.getByRole("heading", { level: 2, name: /Latest/ })).toContainText(`2nd Sem · ${newest.name}`);
      await pub.screenshot({ path: "tests/e2e/.results/grade-terms-public-all.png", fullPage: true });

      // A filter that is on can be cleared in one click.
      await yearSelect.selectOption(older.id);
      await pub.getByRole("button", { name: "Show all terms" }).click();
      await expect(yearSelect).toHaveValue("all");
      await expect(semesterSelect).toHaveValue("all");

      // A student with a single term still gets the filters, opened on that term.
      await record(olderSecond, "99-777003", "ONLYOLDER", 88);
      await pub.goto(`/grades?studentNumber=99-777003&code=ONLYOLDER`);
      await expect(card("QA Term Older 2nd")).toBeVisible();
      await expect(pub.getByLabel("Academic year")).toHaveValue(older.id);
      await expect(pub.getByLabel("Semester")).toHaveValue("2");
      await expect(pub.getByRole("status")).toHaveText(`Showing 2nd Sem · ${older.name} (latest term) — 1 subject.`);

      // A student with nothing dated has nothing to filter.
      await pub.goto(`/grades?studentNumber=99-777002&code=ONLYUNDATED`);
      await expect(card("QA Term Undated")).toBeVisible();
      await expect(pub.getByLabel("Academic year")).toHaveCount(0);
      await publicContext.close();

      // ---- staff: the subject list ----
      const staffContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const staff = await staffContext.newPage();
      staff.setDefaultTimeout(10_000);
      await login(staff, "admin@coe.vantage");
      await staff.goto("/experimental/grades");
      const subjectButton = (name: string) => staff.getByRole("button", { name, exact: true });
      await expect(subjectButton("QA Term Newest 2nd")).toBeVisible();
      await expect(staff.getByRole("status").filter({ hasText: /^Showing \d+ of \d+$/ })).toBeVisible();

      await staff.getByLabel("Filter: year").selectOption(older.id);
      await expect(subjectButton("QA Term Older 2nd")).toBeVisible();
      await expect(subjectButton("QA Term Newest 2nd")).toHaveCount(0);

      await staff.getByLabel("Filter: year").selectOption(newest.id);
      await staff.getByLabel("Filter: semester").selectOption("2");
      await expect(subjectButton("QA Term Newest 2nd")).toBeVisible();
      await expect(subjectButton("QA Term Newest 1st")).toHaveCount(0);
      await staff.screenshot({ path: "tests/e2e/.results/grade-terms-staff-filtered.png" });

      await staff.getByLabel("Filter: year").selectOption("none");
      await expect(subjectButton("QA Term Undated")).toBeVisible();
      await expect(subjectButton("QA Term Newest 2nd")).toHaveCount(0);

      await staff.getByRole("button", { name: "Clear filters" }).click();
      await expect(subjectButton("QA Term Newest 1st")).toBeVisible();

      // ---- staff: give the subject without a term one, from its header ----
      await subjectButton("QA Term Undated").click();
      const header = staff.locator("section").filter({ has: staff.getByRole("heading", { name: "QA Term Undated", level: 2 }) });
      await header.getByLabel("Academic year").selectOption(older.id);
      await expect.poll(async () => ((await (await request.get(`${API}/grade-subjects/${undated}`, { headers })).json()) as { academicYearId: string | null }).academicYearId).toBe(older.id);
      await header.getByLabel("Semester").selectOption("1");
      await expect.poll(async () => ((await (await request.get(`${API}/grade-subjects/${undated}`, { headers })).json()) as { semester: number | null }).semester).toBe(1);
      await expect(staff.getByText(`1st Sem · ${older.name}`).first()).toBeVisible();
      await staffContext.close();
    } finally {
      for (const id of made) await request.delete(`${API}/grade-subjects/${id}`, { headers });
      await request.patch(`${API}/auth/me/experimental-features`, { headers, data: { enabled: prefs.enabled, features: prefs.features } });
      await setCurrent(calendarBefore.calendarAcademicYearId, calendarBefore.calendarSemester ?? undefined);
    }
  });
});

test.describe("grading settings grade keys", () => {
  test("grade keys are picked from the subject's own columns instead of typed", async ({ page, request }) => {
    test.setTimeout(90_000);
    const auth = await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } });
    const headers = { Authorization: `Bearer ${((await auth.json()) as { accessToken: string }).accessToken}` };
    const prefs = (await (await request.get(`${API}/auth/me/experimental-features`, { headers })).json()) as { enabled: boolean; features: string[] };
    let subjectId = "";
    try {
      await request.patch(`${API}/auth/me/experimental-features`, { headers, data: { enabled: true, features: Array.from(new Set([...prefs.features, "gradeModule"])) } });
      const created = await request.post(`${API}/grade-subjects`, { headers, data: { name: "QA Keys Picker" } });
      subjectId = ((await created.json()) as { id: string }).id;
      // The formula names "ghost", a column no record has, next to a real one.
      const patched = await request.patch(`${API}/grade-subjects/${subjectId}`, {
        headers,
        data: {
          gradingSystem: {
            categories: [
              {
                name: "All",
                weight: 100,
                components: [
                  { name: "Quizzes", weight: 50, gradeKeys: ["Quiz 1", "ghost"] },
                  { name: "Exams", weight: 50, gradeKeys: ["Midterm"] },
                ],
              },
            ],
          },
        },
      });
      expect(patched.status(), await patched.text()).toBe(200);
      for (const [n, num] of [["ONE, A", "99-880001"], ["TWO, B", "99-880002"]]) {
        const r = await request.post(`${API}/grade-subjects/${subjectId}/records`, { headers, data: { studentName: n, studentNumber: num, grades: { "Quiz 1": 10, "Quiz 2": 12, Midterm: 80, Finals: 90 } } });
        expect(r.status()).toBe(201);
      }

      await login(page, "admin@coe.vantage");
      await page.goto("/experimental/grades");
      await page.getByRole("button", { name: "QA Keys Picker" }).click();
      await page.getByRole("button", { name: "Grading settings" }).click();
      const dialog = page.getByRole("dialog");

      // No typed field any more.
      await expect(dialog.getByText("Grade keys (comma-separated)")).toHaveCount(0);
      await expect(dialog.getByPlaceholder("Quiz 1, Midterms")).toHaveCount(0);

      const groups = dialog.getByRole("group", { name: /Grade keys/ });
      await expect(groups).toHaveCount(2);
      const quizzes = groups.nth(0);
      const exams = groups.nth(1);
      const box = (group: typeof quizzes, key: string) => group.getByRole("checkbox", { name: key, exact: true });

      // Exactly the subject's columns, with the formula's current picks ticked.
      await expect(quizzes.getByRole("checkbox")).toHaveCount(4);
      await expect(box(quizzes, "Quiz 1")).toBeChecked();
      for (const key of ["Quiz 2", "Midterm", "Finals"]) await expect(box(quizzes, key)).not.toBeChecked();
      await expect(box(exams, "Midterm")).toBeChecked();
      // The key no record has stays visible, flagged, so it can be removed.
      await expect(quizzes.getByRole("button", { name: /ghost · no such column/ })).toBeVisible();

      // Counting a column twice is allowed but called out.
      await quizzes.getByText("Midterm", { exact: true }).click();
      await expect(quizzes.getByText(/Also counted in another component: Midterm \(All › Exams\)/)).toBeVisible();
      await quizzes.getByText("Midterm", { exact: true }).click();
      await expect(quizzes.getByText(/Also counted in another component/)).toHaveCount(0);

      // Pick Quiz 2, drop the ghost, and save.
      await quizzes.getByText("Quiz 2", { exact: true }).click();
      await quizzes.getByRole("button", { name: /ghost · no such column/ }).click();
      await expect(quizzes.getByRole("button", { name: /no such column/ })).toHaveCount(0);

      // A new component starts on the first column nothing counts yet.
      await dialog.getByRole("button", { name: "+ Add component" }).click();
      await expect(groups).toHaveCount(3);
      await expect(box(groups.nth(2), "Finals")).toBeChecked();
      await expect(box(groups.nth(2), "Quiz 1")).not.toBeChecked();
      await dialog.screenshot({ path: "tests/e2e/.results/grade-keys-picker.png" });
      await dialog.getByRole("button", { name: "+ Add component" }).waitFor();
      await groups.nth(2).locator("xpath=ancestor::div[contains(@class,'flex-wrap')][1]").getByRole("button", { name: "Remove" }).click();
      await expect(groups).toHaveCount(2);

      await dialog.getByRole("button", { name: "Save formula" }).click();
      await expect
        .poll(async () => {
          const subject = (await (await request.get(`${API}/grade-subjects/${subjectId}`, { headers })).json()) as {
            gradingSystem: { categories: { components: { gradeKeys: string[] }[] }[] };
          };
          return subject.gradingSystem.categories[0].components.map((c) => c.gradeKeys);
        })
        .toEqual([["Quiz 1", "Quiz 2"], ["Midterm"]]);
    } finally {
      if (subjectId) await request.delete(`${API}/grade-subjects/${subjectId}`, { headers });
      await request.patch(`${API}/auth/me/experimental-features`, { headers, data: { enabled: prefs.enabled, features: prefs.features } });
    }
  });
});

test.describe("grade import layouts", () => {
  test("the header can be below a title, and common header spellings are accepted", async ({ request }) => {
    test.setTimeout(60_000);
    const auth = await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } });
    const headers = { Authorization: `Bearer ${((await auth.json()) as { accessToken: string }).accessToken}` };
    const created = await request.post(`${API}/grade-subjects`, { headers, data: { name: "QA Import Layouts" } });
    const subjectId = ((await created.json()) as { id: string }).id;
    const upload = async (csv: string) => {
      const response = await request.post(`${API}/grade-subjects/${subjectId}/records/import-csv`, {
        headers,
        multipart: { file: { name: "grades.csv", mimeType: "text/csv", buffer: Buffer.from(csv) } },
      });
      return { status: response.status(), body: (await response.json()) as { imported?: number; skipped?: number; errors?: string[]; message?: string } };
    };
    const records = async () =>
      (await (await request.get(`${API}/grade-subjects/${subjectId}/records`, { headers })).json()) as { studentName: string; grades: Record<string, number>; maxScores: Record<string, number> }[];
    try {
      // A printed class record: blank row, title, schedule, then the header on row 4. The first column has no header,
      // "50%" only labels a weight, and Final Grade / Remarks are not scores.
      const classRecord = [
        ",,,,,,,,",
        ",CPE000 1A,,,,,,,",
        ",2-4 M 216 COE,,,,,,,",
        ",Name,Student Number ,Lab 1,Lab 2,50%,Project,Final Grade,Remarks",
        ",,,100,100,,100,,",
        '1,"DOE, JANE",99-990001,90,80,,70,1.5,PASSED',
        '2,"ROE, RICK",99-990002,100,,,85,1.25,PASSED',
        ",,,,,,,,",
        ",,,max,mid,min,,,",
      ].join("\n");
      const a = await upload(classRecord);
      expect(a.status, JSON.stringify(a.body)).toBe(201);
      expect(a.body.imported).toBe(2);
      expect(a.body.skipped, `unexpected warnings: ${a.body.errors}`).toBe(0);
      const rows = await records();
      expect(rows.map((r) => r.studentName).sort()).toEqual(["DOE, JANE", "ROE, RICK"]);
      const jane = rows.find((r) => r.studentName === "DOE, JANE")!;
      expect(jane.grades).toEqual({ "Lab 1": 90, "Lab 2": 80, Project: 70 });
      expect(jane.maxScores).toEqual({ "Lab 1": 100, "Lab 2": 100, Project: 100 });
      // A blank score stays blank; it is not stored as 0.
      expect(rows.find((r) => r.studentName === "ROE, RICK")!.grades).toEqual({ "Lab 1": 100, Project: 85 });

      // Other spellings of the two identity headers.
      for (const [nameHeader, numberHeader] of [["Full Name", "Student No."], ["Student's Name", "ID Number"], ["NAME", "student_number"]]) {
        const b = await upload([`${nameHeader},${numberHeader},Quiz 1`, ",,20", "DOE JANE,99-990001,15"].join("\n"));
        expect(b.status, `${nameHeader} / ${numberHeader}: ${JSON.stringify(b.body)}`).toBe(201);
        expect(b.body.imported).toBe(1);
      }

      // The layout the importer always took (and the dialog's own template): header on the first row.
      const legacy = await upload(["studentName,studentNumber,email,Quiz 1,Midterms,Finals", ",,,20,100,100", "Juan Dela Cruz,24-000001,juan@example.com,18,90,88"].join("\n"));
      expect(legacy.status, JSON.stringify(legacy.body)).toBe(201);
      expect(legacy.body.imported).toBe(1);
      expect(legacy.body.skipped).toBe(0);

      // No name / student number header anywhere: a clear message, and nothing is replaced.
      const none = await upload(["Title,,", "Foo,Bar,Baz", "1,2,3"].join("\n"));
      expect(none.status).toBe(400);
      expect(none.body.message).toMatch(/name column/i);
      expect((await records()).map((r) => r.studentName)).toEqual(["Juan Dela Cruz"]);

      // A bad score is reported against the row number it has in the sheet (row 8 here: header on row 4, max on 5).
      const bad = await upload([",,,", ",,,", ",,,", "Name,Student Number,Lab 1", ",,100", "A,99-990001,10", "B,99-990002,11", "C,99-990003,oops"].join("\n"));
      expect(bad.status).toBe(201);
      expect(bad.body.imported).toBe(2);
      expect(bad.body.errors?.[0]).toContain("Row 8:");
    } finally {
      await request.delete(`${API}/grade-subjects/${subjectId}`, { headers });
    }
  });
});

test.describe("public lookup missing items", () => {
  test("a student sees which items have no score yet", async ({ browser, request }) => {
    test.setTimeout(90_000);
    const auth = await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } });
    const headers = { Authorization: `Bearer ${((await auth.json()) as { accessToken: string }).accessToken}` };
    const made: string[] = [];
    const subject = async (name: string, keys: string[], compute = false) => {
      const created = await request.post(`${API}/grade-subjects`, { headers, data: { name } });
      const id = ((await created.json()) as { id: string }).id;
      made.push(id);
      const patched = await request.patch(`${API}/grade-subjects/${id}`, {
        headers,
        data: { studentComputeEnabled: compute, gradingSystem: { categories: [{ name: "All", weight: 100, components: [{ name: "All", weight: 100, gradeKeys: keys }] }] } },
      });
      expect(patched.status(), await patched.text()).toBe(200);
      return id;
    };
    try {
      // The formula lists Quiz 1, Quiz 2, Finals. The stored/alphabetical order would be Finals, Quiz 1, Quiz 2.
      const main = await subject("QA Missing Items", ["Quiz 1", "Quiz 2", "Finals"], true);
      const max = { "Quiz 1": 20, "Quiz 2": 20, Finals: 100 };
      const imported = await request.post(`${API}/grade-subjects/${main}/records/import`, {
        headers,
        data: {
          records: [
            { studentName: "PARTIAL, PAT", studentNumber: "99-550001", code: "MISSA", grades: { "Quiz 1": 10 }, maxScores: max },
            { studentName: "COMPLETE, CAL", studentNumber: "99-550002", code: "MISSB", grades: { "Quiz 1": 18, "Quiz 2": 17, Finals: 90 }, maxScores: max },
          ],
        },
      });
      expect(imported.status(), await imported.text()).toBe(201);

      // An item with a maximum but no score from anyone is an item (the max-score row defines the column). A formula key that
      // is no column at all ("Typo Key") is a settings problem, not something the student lacks.
      const lonely = await subject("QA Never Given", ["Quiz 1", "Never Given", "Typo Key"]);
      await request.post(`${API}/grade-subjects/${lonely}/records`, {
        headers,
        data: { studentName: "SOLO, SAM", studentNumber: "99-550003", code: "MISSC", grades: { "Quiz 1": 5 }, maxScores: { "Quiz 1": 10, "Never Given": 50 } },
      });
      const api = (await (await request.get(`${API}/grade-subjects/public/records?studentNumber=99-550003&code=MISSC`)).json()) as { items: string[]; subject: Record<string, unknown> }[];
      expect(api[0].items).toEqual(["Quiz 1", "Never Given"]);
      // Only item names go out: never the grading formula.
      expect(JSON.stringify(api[0])).not.toContain("gradingSystem");

      const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
      const pub = await context.newPage();
      pub.setDefaultTimeout(10_000);
      const card = (name: string) => pub.locator("div.rounded.border", { has: pub.getByRole("heading", { name, level: 3 }) });
      const labels = (name: string) => card(name).locator("div.border-b > span:first-child").allTextContents();

      // A student with scores for one item out of three.
      await pub.goto("/grades?studentNumber=99-550001&code=MISSA");
      const partial = card("QA Missing Items");
      await expect(partial).toBeVisible();
      await expect(partial.getByText("2 missing")).toBeVisible();
      await expect(partial.getByText("of 3 items")).toBeVisible();
      expect(await labels("QA Missing Items")).toEqual(["Quiz 1", "Quiz 2", "Finals"]); // the formula's order
      await expect(partial.getByText("Missing", { exact: true })).toHaveCount(2);
      await expect(partial.getByText("10 / 20", { exact: true })).toBeVisible();
      await expect(partial.locator("div.border-b", { hasText: "Quiz 2" })).toContainText("/ 20");
      await pub.screenshot({ path: "tests/e2e/.results/public-missing.png", fullPage: true });

      // Computing does not make the blanks disappear.
      await partial.getByRole("button", { name: "Compute my grade" }).click();
      await expect(partial.getByRole("button", { name: "Compute my grade" })).toBeEnabled();
      await expect(partial.getByText("2 missing")).toBeVisible();
      expect(await labels("QA Missing Items")).toEqual(["Quiz 1", "Quiz 2", "Finals"]);

      // A student with every item scored.
      await pub.goto("/grades?studentNumber=99-550002&code=MISSB");
      const complete = card("QA Missing Items");
      await expect(complete.getByText("All 3 items have a score.")).toBeVisible();
      await expect(complete.getByText("Missing", { exact: true })).toHaveCount(0);

      // An item nobody has a score for yet shows as missing too.
      await pub.goto("/grades?studentNumber=99-550003&code=MISSC");
      const solo = card("QA Never Given");
      await expect(solo.getByText("1 missing")).toBeVisible();
      expect(await labels("QA Never Given")).toEqual(["Quiz 1", "Never Given"]);
      await context.close();
    } finally {
      for (const id of made) await request.delete(`${API}/grade-subjects/${id}`, { headers });
    }
  });
});

test.describe("columns follow the max scores", () => {
  test("a column shows as soon as it has a maximum, even with no score in it yet", async ({ page, request }) => {
    test.setTimeout(90_000);
    const auth = await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } });
    const headers = { Authorization: `Bearer ${((await auth.json()) as { accessToken: string }).accessToken}` };
    const prefs = (await (await request.get(`${API}/auth/me/experimental-features`, { headers })).json()) as { enabled: boolean; features: string[] };
    let subjectId = "";
    try {
      await request.patch(`${API}/auth/me/experimental-features`, { headers, data: { enabled: true, features: Array.from(new Set([...prefs.features, "gradeModule"])) } });
      subjectId = ((await (await request.post(`${API}/grade-subjects`, { headers, data: { name: "QA Columns Follow Max" } })).json()) as { id: string }).id;
      // The sheet's max-score row names four columns; nobody has a score in Lab 10, Lab 2 is scored, and "Typo Key" is
      // only in the formula (no maximum, no score).
      const max = { "Lab 2": 20, "Lab 10": 20, Midterms: 100, Finals: 100 };
      await request.patch(`${API}/grade-subjects/${subjectId}`, {
        headers,
        data: { gradingSystem: { categories: [{ name: "All", weight: 100, components: [{ name: "All", weight: 100, gradeKeys: ["Finals", "Lab 2", "Typo Key"] }] }] } },
      });
      const imported = await request.post(`${API}/grade-subjects/${subjectId}/records/import`, {
        headers,
        data: {
          records: [
            { studentName: "ONE, A", studentNumber: "99-440001", grades: { "Lab 2": 15, Midterms: 80 }, maxScores: max },
            { studentName: "TWO, B", studentNumber: "99-440002", grades: { "Lab 2": 18 }, maxScores: max },
          ],
        },
      });
      expect(imported.status(), await imported.text()).toBe(201);

      await login(page, "admin@coe.vantage");
      await page.goto("/experimental/grades");
      await page.getByRole("button", { name: "QA Columns Follow Max" }).click();
      await expect(page.getByText("Showing 2 of 2")).toBeVisible();

      // All four columns, formula items first (Finals, Lab 2), then the rest with Lab 10 after Lab 2 in natural order.
      const headers4 = page.locator("thead th").filter({ hasText: /^(Finals|Lab 2|Lab 10|Midterms)$/ });
      await expect(headers4).toHaveText(["Finals", "Lab 2", "Lab 10", "Midterms"]);
      await expect(page.locator("thead th").filter({ hasText: "Typo Key" })).toHaveCount(0);
      // Nobody has a Finals or Lab 10 score: those cells are blank dashes, not missing columns.
      const firstRow = page.locator("tbody tr").first();
      await expect(firstRow.getByText("—")).not.toHaveCount(0);

      // Add record starts from the same columns, already out of the class's maximums.
      await page.getByRole("button", { name: "Add record" }).click();
      const dialog = page.getByRole("dialog");
      for (const key of ["Finals", "Lab 2", "Lab 10", "Midterms"]) await expect(dialog.getByText(key, { exact: true })).toBeVisible();
      const finalsRow = dialog.locator("tr", { hasText: "Finals" });
      await expect(finalsRow.getByPlaceholder("100")).toHaveValue("100");
      await expect(dialog.locator("tr", { hasText: "Lab 10" }).getByPlaceholder("100")).toHaveValue("20");
      await page.keyboard.press("Escape");

      // The grade-keys picker offers the blank column too, and flags the key that is no column.
      await page.getByRole("button", { name: "Grading settings" }).click();
      const picker = page.getByRole("dialog").getByRole("group", { name: /Grade keys/ });
      await expect(picker.getByRole("checkbox")).toHaveCount(4);
      await expect(picker.getByRole("checkbox", { name: "Lab 10", exact: true })).toBeVisible();
      await expect(picker.getByRole("button", { name: /Typo Key · no such column/ })).toBeVisible();
    } finally {
      if (subjectId) await request.delete(`${API}/grade-subjects/${subjectId}`, { headers });
      await request.patch(`${API}/auth/me/experimental-features`, { headers, data: { enabled: prefs.enabled, features: prefs.features } });
    }
  });
});

test.describe("MMSU grade table defaults", () => {
  test("the default table and passing grade follow the portal's rule", async ({ page, request }) => {
    test.setTimeout(90_000);
    const auth = await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } });
    const headers = { Authorization: `Bearer ${((await auth.json()) as { accessToken: string }).accessToken}` };
    const prefs = (await (await request.get(`${API}/auth/me/experimental-features`, { headers })).json()) as { enabled: boolean; features: string[] };
    let subjectId = "";
    try {
      await request.patch(`${API}/auth/me/experimental-features`, { headers, data: { enabled: true, features: Array.from(new Set([...prefs.features, "gradeModule"])) } });
      // A subject nobody has configured yet.
      subjectId = ((await (await request.post(`${API}/grade-subjects`, { headers, data: { name: "QA MMSU Defaults" } })).json()) as { id: string }).id;

      await login(page, "admin@coe.vantage");
      await page.goto("/experimental/grades");
      await page.getByRole("button", { name: "QA MMSU Defaults" }).click();
      await page.getByRole("button", { name: "Grading settings" }).click();
      const dialog = page.getByRole("dialog");

      // The portal passes 1.00 to 3.00, and 3.00 starts at 50%: the passing percent offered is 50, not 75.
      const passing = dialog.getByLabel(/^Passing %/);
      await expect(passing).toHaveValue("50");
      await dialog.getByRole("button", { name: "Save passing & access" }).click();
      await expect
        .poll(async () => ((await (await request.get(`${API}/grade-subjects/${subjectId}`, { headers })).json()) as { gradingSystem: { passingGrade?: number } | null }).gradingSystem?.passingGrade)
        .toBe(50);

      // "Reset to MMSU Default" gives the portal's outcomes: Passed up to 3.00, Conditional for 4.00, Failed for 5.00.
      await dialog.getByRole("button", { name: "Reset to MMSU Default", exact: true }).click();
      await dialog.getByRole("button", { name: "Save equivalence table" }).click();
      await expect
        .poll(async () => {
          const subject = (await (await request.get(`${API}/grade-subjects/${subjectId}`, { headers })).json()) as {
            gradingSystem: { gradeEquivalence?: { letter: string; remarks?: string }[] } | null;
          };
          return Object.fromEntries((subject.gradingSystem?.gradeEquivalence ?? []).map((row) => [row.letter, row.remarks]));
        })
        .toEqual({ "1": "PASSED", "1.25": "PASSED", "1.5": "PASSED", "1.75": "PASSED", "2": "PASSED", "2.25": "PASSED", "2.5": "PASSED", "2.75": "PASSED", "3": "PASSED", "4": "CND", "5": "FAILED" });
    } finally {
      if (subjectId) await request.delete(`${API}/grade-subjects/${subjectId}`, { headers });
      await request.patch(`${API}/auth/me/experimental-features`, { headers, data: { enabled: prefs.enabled, features: prefs.features } });
    }
  });
});

test.describe("INC for blank items", () => {
  test("a blank item makes the grade INC; a zero computes it as is", async ({ browser, page, request }) => {
    test.setTimeout(120_000);
    const auth = await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } });
    const headers = { Authorization: `Bearer ${((await auth.json()) as { accessToken: string }).accessToken}` };
    const prefs = (await (await request.get(`${API}/auth/me/experimental-features`, { headers })).json()) as { enabled: boolean; features: string[] };
    const made: string[] = [];
    const subject = async (name: string, keys: string[]) => {
      const id = ((await (await request.post(`${API}/grade-subjects`, { headers, data: { name } })).json()) as { id: string }).id;
      made.push(id);
      const patched = await request.patch(`${API}/grade-subjects/${id}`, {
        headers,
        data: {
          studentComputeEnabled: true,
          gradingSystem: {
            passingGrade: 50,
            gradeEquivalence: [
              { minPercent: 75, maxPercent: 100, letter: "1", remarks: "PASSED" },
              { minPercent: 50, maxPercent: 74.99, letter: "3", remarks: "PASSED" },
              { minPercent: 0, maxPercent: 49.99, letter: "5", remarks: "FAILED" },
            ],
            categories: [{ name: "All", weight: 100, components: [{ name: "All", weight: 100, gradeKeys: keys }] }],
          },
        },
      });
      expect(patched.status(), await patched.text()).toBe(200);
      return id;
    };
    type Computed = { incomplete?: boolean; finalGrade: number | null; letterGrade: string | null; remarks: string | null; passed: boolean | null; missingKeys?: string[] };
    const computedByName = async (id: string) => {
      const recs = (await (await request.get(`${API}/grade-subjects/${id}/records`, { headers })).json()) as { studentName: string; computedGrade: Computed | null }[];
      return Object.fromEntries(recs.map((r) => [r.studentName, r.computedGrade]));
    };
    try {
      await request.patch(`${API}/auth/me/experimental-features`, { headers, data: { enabled: true, features: Array.from(new Set([...prefs.features, "gradeModule"])) } });
      const main = await subject("QA INC Rule", ["Quiz 1", "Quiz 2", "Finals"]);
      const max = { "Quiz 1": 20, "Quiz 2": 20, Finals: 100 };
      const imported = await request.post(`${API}/grade-subjects/${main}/records/import`, {
        headers,
        data: {
          records: [
            // Quiz 2 left blank.
            { studentName: "BLANK, BEA", studentNumber: "99-330001", code: "ZZA", grades: { "Quiz 1": 20, Finals: 100 }, maxScores: max },
            // Quiz 2 entered as 0 on purpose.
            { studentName: "ZERO, ZED", studentNumber: "99-330002", code: "ZZB", grades: { "Quiz 1": 20, "Quiz 2": 0, Finals: 100 }, maxScores: max },
            { studentName: "FULL, FAY", studentNumber: "99-330003", code: "ZZC", grades: { "Quiz 1": 20, "Quiz 2": 20, Finals: 100 }, maxScores: max },
          ],
        },
      });
      expect(imported.status(), await imported.text()).toBe(201);

      // A formula key that is not a column of the subject at all must not turn the whole class INC.
      const ghost = await subject("QA INC Ghost Key", ["Quiz 1", "Typo Key"]);
      await request.post(`${API}/grade-subjects/${ghost}/records`, {
        headers,
        data: { studentName: "GHOST, GUS", studentNumber: "99-330004", code: "ZZG", grades: { "Quiz 1": 10 }, maxScores: { "Quiz 1": 10 } },
      });

      // ---- staff: the Compute grades button
      await login(page, "admin@coe.vantage");
      await page.goto("/experimental/grades");
      await page.getByRole("button", { name: "QA INC Rule", exact: true }).click();
      await expect(page.getByText("Showing 3 of 3")).toBeVisible();
      await page.getByRole("button", { name: "Compute grades" }).click();
      const row = (name: string) => page.locator("tbody tr", { hasText: name });
      // The Final column is the second cell of the row (the first is the frozen name cell).
      const final = (name: string) => row(name).locator("td").nth(1);
      await expect(final("BLANK, BEA")).toContainText("INC");
      await expect(final("BLANK, BEA")).toContainText("1 item missing");
      await expect(final("ZERO, ZED")).toContainText("85.71");
      await expect(final("FULL, FAY")).toContainText("100");
      await expect(final("BLANK, BEA")).not.toContainText("85.71");

      // What was stored: no number and no pass/fail for INC; the exact missing item; the zero student computed.
      const stored = await computedByName(main);
      expect(stored["BLANK, BEA"]).toMatchObject({ incomplete: true, finalGrade: null, letterGrade: "INC", remarks: "INC", passed: null, missingKeys: ["Quiz 2"] });
      expect(stored["ZERO, ZED"]).toMatchObject({ incomplete: false, finalGrade: 85.71, letterGrade: "1", remarks: "PASSED", passed: true });
      expect(stored["FULL, FAY"]).toMatchObject({ incomplete: false, finalGrade: 100 });

      // The details dialog says which item is missing and how to force it.
      await page.getByRole("button", { name: "More actions for BLANK, BEA" }).click();
      await page.getByRole("menuitem", { name: "View details" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText("No score for")).toBeVisible();
      await expect(dialog.getByText(/Enter 0 for an item to count it as zero/)).toBeVisible();
      await page.keyboard.press("Escape");

      // Entering the 0 and computing again gives a number.
      const bea = (await (await request.get(`${API}/grade-subjects/${main}/records`, { headers })).json()) as { id: string; studentName: string }[];
      const beaId = bea.find((r) => r.studentName === "BLANK, BEA")!.id;
      const patchedRecord = await request.patch(`${API}/grade-subjects/${main}/records/${beaId}`, { headers, data: { grades: { "Quiz 1": 20, "Quiz 2": 0, Finals: 100 } } });
      expect(patchedRecord.status(), await patchedRecord.text()).toBe(200);
      await page.getByRole("button", { name: "Compute grades" }).click();
      await expect(final("BLANK, BEA")).toContainText("85.71");
      await expect(final("BLANK, BEA")).not.toContainText("INC");
      // ...and putting the blank back returns it to INC.
      await request.patch(`${API}/grade-subjects/${main}/records/${beaId}`, { headers, data: { grades: { "Quiz 1": 20, Finals: 100 } } });
      await page.getByRole("button", { name: "Compute grades" }).click();
      await expect(final("BLANK, BEA")).toContainText("INC");

      // ---- a stale formula key does not make everyone INC
      expect((await request.post(`${API}/grade-subjects/${ghost}/compute-grades`, { headers })).status()).toBeLessThan(300);
      const ghostResult = (await computedByName(ghost))["GHOST, GUS"];
      expect(ghostResult?.incomplete).toBe(false);
      expect(ghostResult?.letterGrade).not.toBe("INC");

      // ---- the student's page, including "Compute my grade"
      const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
      const pub = await context.newPage();
      pub.setDefaultTimeout(10_000);
      await pub.goto("/grades?studentNumber=99-330001&code=ZZA");
      await expect(pub.getByText("Final: INC")).toBeVisible();
      await expect(pub.getByText(/Incomplete — 1 item missing/)).toBeVisible();
      await expect(pub.getByText("Pass", { exact: true })).toHaveCount(0);
      await expect(pub.getByText("Fail", { exact: true })).toHaveCount(0);
      await pub.getByRole("button", { name: "Compute my grade" }).click();
      await expect(pub.getByRole("button", { name: "Compute my grade" })).toBeEnabled();
      await expect(pub.getByText("Final: INC")).toBeVisible();
      await pub.screenshot({ path: "tests/e2e/.results/public-inc.png", fullPage: true });

      await pub.goto("/grades?studentNumber=99-330002&code=ZZB");
      await pub.getByRole("button", { name: "Compute my grade" }).click();
      await expect(pub.getByText("Final: 85.71")).toBeVisible();
      await expect(pub.getByText("Pass", { exact: true })).toBeVisible();
      await context.close();
    } finally {
      for (const id of made) await request.delete(`${API}/grade-subjects/${id}`, { headers });
      await request.patch(`${API}/auth/me/experimental-features`, { headers, data: { enabled: prefs.enabled, features: prefs.features } });
    }
  });
});
