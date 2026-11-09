import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The MMSU grade push extension, loaded for real into Chromium and pointed at a fake copy of the portal.
 * The fake portal reproduces the markup of the real gradesheet page (form, grade dropdowns, Save and Remove
 * buttons, redirect after save) with made-up students. It needs no Vantage backend or frontend.
 */
const frontendRoot = fileURLToPath(new URL("../../", import.meta.url));
const extensionDir = join(frontendRoot, "extensions", "mmsu-gradesheet", "dist");
const PORTAL = "https://my.mmsu.edu.ph";
const SHEET_URL = `${PORTAL}/my/class/gradesheet/70280`;
const OPTIONS = ["1.00", "1.25", "1.50", "1.75", "2.00", "2.25", "2.50", "2.75", "3.00", "4.00", "5.00", "INC", "DRP", "IP"];

interface Student { id: number; number: string; name: string; grade: string }

const freshStudents = (): Student[] => [
  { id: 9001, number: "99-000001", name: "ALPHA, ANNA TEST", grade: "" },
  { id: 9002, number: "99-000002", name: "BRAVO, BEN TEST", grade: "" },
  { id: 9003, number: "99-000003", name: "CHARLIE, CARLA TEST", grade: "" },
  { id: 9004, number: "99-000004", name: "DELTA, DAN TEST", grade: "" },
  { id: 9005, number: "99-000005", name: "ECHO, EVE TEST", grade: "3.00" },
  { id: 9006, number: "99-000006", name: "FOXTROT, FRED TEST", grade: "" },
];

function sheetHtml(sheetId: number, students: Student[], flash: string | null, withSaveButton = true): string {
  const rows = students
    .map((s, i) => `
      <tr>
        <td><input type="checkbox" name="check_${s.id}" value="${s.id}" class="chkStuds"></td>
        <td>${i + 1}.</td><td>${s.name}</td><td>${s.number}</td><td>BS COMP ENG</td>
        <td><select name="grade_${s.id}" id="grade_${s.id}" class="form-control grade">
          ${OPTIONS.map((o) => `<option value="${o}"${o === s.grade ? " selected" : ""}>${o}</option>`).join("")}
          <option value="0"${s.grade === "" ? " selected" : ""}>---</option></select></td>
        <td id="rem_${s.id}" class="remarks"></td>
      </tr>`)
    .join("");
  return `<!DOCTYPE html><html><body>
    ${flash ? `<div class="flash alert-flash text-center" style="display: none;">${flash}</div>` : ""}
    <table class="table"><tbody>
      <tr><td>Course</td><td>TEST 101</td><td>&nbsp;</td><td>Title</td><td>Testing Basics</td></tr>
      <tr><td><form action="${PORTAL}/my/class/gradesheet-reset" method="POST"><input type="submit" name="reload" value="Reset Gradesheet"></form></td></tr>
    </tbody></table>
    <form action="${PORTAL}/my/class/gradesheet/update/${sheetId}" method="POST">
      <div class="panel-heading">Gradesheet for <strong> Testing Basics </strong>(7447)</div>
      <table class="table"><thead><tr><td><input type="checkbox" name="invert"></td><td>#</td><td>Name</td><td>Student Number</td><td>Degree</td><td>Grade</td><td>Remarks</td></tr></thead>
      <tbody>${rows}
        <tr><td colspan="3"><input type="submit" name="removestudents" value="Remove Selected"></td></tr>
      </tbody></table>
      <input type="text" name="team" id="team" value="">
      ${withSaveButton ? '<input type="submit" name="savegradesheet" value="Save Gradesheet">' : ""}
    </form>
    <script>
      window.__changes = 0;
      document.querySelectorAll('.grade').forEach(function (s) {
        function set() { document.getElementById('rem_' + s.id.slice(6)).textContent = parseInt(s.value) > 0 && parseInt(s.value) <= 3 ? 'Passed' : ''; }
        s.addEventListener('change', function () { window.__changes++; set(); });
        set();
      });
    </script></body></html>`;
}

/** The fake portal. `onSave` lets a test make the server misbehave. */
interface Portal {
  students: Student[];
  posts: string[];
  onSave?: (students: Student[]) => void;
  withSaveButton: boolean;
  /** Each test gets its own sheet, like each real gradesheet has its own id (the extension keeps one job per sheet). */
  sheetId: number;
  /** Requests that were not answered by the fake portal (they are aborted, never sent to the real site). */
  leaked: string[];
}

let nextSheetId = 93955;

async function startPortal(context: BrowserContext): Promise<Portal> {
  const portal: Portal = { students: freshStudents(), posts: [], withSaveButton: true, sheetId: nextSheetId++, leaked: [] };
  // Registered first, so it only gets what the portal route below does not take. Nothing may reach the real site.
  await context.route("**/*", async (route) => {
    portal.leaked.push(`${route.request().method()} ${route.request().url()}`);
    await route.abort();
  });
  // The Vantage server's access answer (the extension's background worker asks it; no real server is involved).
  await context.route(`${VANTAGE_API}/**`, async (route) => {
    const request = route.request();
    vantageRequests.push({ url: new URL(request.url()).pathname, cookie: request.headers()["cookie"] });
    await route.fulfill({ status: vantageStatus, contentType: "application/json", body: JSON.stringify(vantageAnswer) });
  });
  await context.route(`${PORTAL}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname.includes("/gradesheet/update/")) {
      const form = new URLSearchParams(request.postData() ?? "");
      portal.posts.push(request.postData() ?? "");
      for (const s of portal.students) {
        const value = form.get(`grade_${s.id}`);
        if (value !== null) s.grade = value === "0" ? "" : value;
      }
      portal.onSave?.(portal.students);
      // The portal answers the POST with the gradesheet page itself, carrying its "Gradesheet Updated" flash.
      await route.fulfill({ status: 200, contentType: "text/html", body: sheetHtml(portal.sheetId, portal.students, "Gradesheet Updated", portal.withSaveButton) });
      return;
    }
    if (url.pathname.startsWith("/my/class/gradesheet/")) {
      await route.fulfill({ status: 200, contentType: "text/html", body: sheetHtml(portal.sheetId, portal.students, null, portal.withSaveButton) });
      return;
    }
    await route.fulfill({ status: 404, body: "not found" });
  });
  return portal;
}

/** A stand-in for the Vantage server's "may this person use the extension?" answer. */
let vantageAnswer: Record<string, unknown> = {};
let vantageStatus = 200;
let vantageRequests: { url: string; cookie: string | undefined }[] = [];
const VANTAGE_API = "http://127.0.0.1:4999";
const ALLOWED = { allowed: true, user: { name: "QA Teacher", email: "qa.teacher@example.test" }, appUrl: "http://localhost:5173" };

const tsv = (rows: string[][]) => rows.map((row) => row.join("\t")).join("\n");

const SAMPLE = tsv([
  ["No.", "Name", "Student Number", "Major Output 70%", "Final Grade", "Remarks"],
  ["1", "Alpha, Anna Test", "99-000001", "88", "1.5", "PASSED"],
  ["2", "Bravo, Ben Test", "99000002", "80", "2", "PASSED"],
  ["3", "Charlie, Carla Test", "99-000003", "60", "INC", ""],
  ["4", "Delta, Dan Test", "99-000004", "50", "3.25", ""],
  ["5", "Echo, Eve Test", "99-000005", "75", "3", "PASSED"],
  ["6", "Zulu, Zed Nobody", "99-000099", "70", "2.5", ""],
  ["7", "Somebody Else", "99-000006", "70", "2.5", ""],
]);

async function open(context: BrowserContext, url = SHEET_URL): Promise<Page> {
  const page = await context.newPage();
  await page.goto(url);
  await page.getByRole("button", { name: "Vantage grade push" }).click();
  return page;
}

async function paste(page: Page, text: string) {
  await page.getByLabel("Pasted table").fill(text);
}

const selectValue = (page: Page, id: number) => page.locator(`#grade_${id}`).inputValue();

test.describe("MMSU grade push extension", () => {
  test.describe.configure({ mode: "serial" });
  let context: BrowserContext;
  let userDataDir: string;
  let portal: Portal;
  /** The extension's background worker; Chromium stops an idle one, so the test that needs it runs first. */
  let worker: import("@playwright/test").Worker;

  test.beforeAll(async () => {
    execFileSync(process.execPath, ["scripts/build-extension.mjs"], { cwd: frontendRoot, stdio: "pipe" });
    userDataDir = mkdtempSync(join(tmpdir(), "vantage-ext-"));
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      viewport: { width: 1280, height: 1000 },
      deviceScaleFactor: 2,
      args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
    });
    worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker", { timeout: 15_000 }));
    await worker.evaluate(async (url) => {
      await (globalThis as unknown as { chrome: { storage: { local: { set(items: object): Promise<void> } } } }).chrome.storage.local.set({ "vantage-api-url": url });
    }, VANTAGE_API);
  });

  test.afterAll(async () => {
    await context?.close();
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true });
  });

  test.afterEach(() => {
    expect(portal.leaked, "requests that were not answered by the fake portal").toEqual([]);
  });

  test.beforeEach(async () => {
    vantageAnswer = ALLOWED;
    vantageStatus = 200;
    vantageRequests = [];
    await worker.evaluate(async () => {
      await (globalThis as unknown as { chrome: { storage: { local: { remove(key: string): Promise<void> } } } }).chrome.storage.local.remove("vantage-mmsu-access");
    });
    for (const page of context.pages()) await page.close();
    await context.unrouteAll();
    portal = await startPortal(context);
  });

  test("without Vantage access the panel offers nothing but the reason, and Check again lets the person in", async () => {
    const denied: [Record<string, unknown>, string][] = [
      [{ allowed: false, reason: "signed_out", appUrl: "http://localhost:5173" }, "Sign in to Vantage"],
      [{ allowed: false, reason: "not_granted", user: { name: "QA Teacher", email: "q@example.test" }, appUrl: "http://localhost:5173" }, "No access yet"],
      [{ allowed: false, reason: "not_enabled", user: { name: "QA Teacher", email: "q@example.test" }, appUrl: "http://localhost:5173" }, "Turn it on in Vantage"],
      [{ allowed: false, reason: "role", user: { name: "QA Teacher", email: "q@example.test" }, appUrl: "http://localhost:5173" }, "Not available for your role"],
    ];
    for (const [answer, title] of denied) {
      vantageAnswer = answer;
      const page = await open(context);
      await expect(page.getByText(title, { exact: true })).toBeVisible();
      await expect(page.getByLabel("Pasted table")).toBeHidden();
      await page.close();
    }
    // The server is down or errors: closed, with a retry.
    vantageStatus = 500;
    const page = await open(context);
    await expect(page.getByText("Could not reach Vantage")).toBeVisible();
    await expect(page.getByLabel("Pasted table")).toBeHidden();
    // Access is granted meanwhile; Check again opens the tool.
    vantageStatus = 200;
    vantageAnswer = ALLOWED;
    await page.getByRole("button", { name: "Check again" }).click();
    await expect(page.getByLabel("Pasted table")).toBeVisible();
    await expect(page.getByText("Signed in to Vantage as QA Teacher")).toBeVisible();
    // The check sends no grades or portal data, only a GET to the access address.
    expect(vantageRequests.every((r) => r.url === "/auth/extension-access/mmsu-grade-push")).toBe(true);
    // A positive answer is reused, so the next gradesheet does not ask again.
    const asked = vantageRequests.length;
    const second = await open(context, `${PORTAL}/my/class/gradesheet/${portal.sheetId}`);
    await expect(second.getByLabel("Pasted table")).toBeVisible();
    expect(vantageRequests.length).toBe(asked);
  });

  test("the toolbar icon opens the portal's Grade Sheet list in a new tab", async () => {
    // A tab opened by the extension starts loading before the test can intercept it, so the call is stubbed
    // and the URL it was given is checked: no request is ever made to the real portal.
    const url = await worker.evaluate(
      () =>
        new Promise<string>((resolve) => {
          const api = (globalThis as unknown as { chrome: { tabs: { create: (p: { url: string }) => Promise<unknown> } } }).chrome;
          api.tabs.create = (properties) => {
            resolve(properties.url);
            return Promise.resolve({});
          };
          (globalThis as unknown as { vantageOpenGradesheets: () => void }).vantageOpenGradesheets();
        })
    );
    expect(url).toBe(`${PORTAL}/my/class/gradesheet`);
  });

  test("pastes, shows what will change, saves, and confirms the portal matches", async () => {
    const page = await open(context);
    await paste(page, SAMPLE);

    // Columns were found from the header; grades are normalised to the portal's own options.
    await expect(page.getByLabel("Student number")).toHaveValue("2");
    await expect(page.getByLabel("Final grade")).toHaveValue("4");
    await expect(page.getByText("4 to change")).toBeVisible();
    await expect(page.getByText("1 already set")).toBeVisible();
    await expect(page.getByText("3.25 is not a grade the portal offers")).toBeVisible();
    await expect(page.getByText("no student with this number on the portal gradesheet")).toBeVisible();
    // A number that matched but a name that does not is held back until the person ticks it.
    await expect(page.getByText(/Name differs — portal has "FOXTROT, FRED TEST"/)).toBeVisible();
    await expect(page.getByLabel("Apply 99-000006")).not.toBeChecked();

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Fill and save gradesheet" }).click();

    await expect(page.getByText("All 4 grades on the portal match your sheet.")).toBeVisible();
    await expect(page.getByText("Portal message: Gradesheet Updated")).toBeVisible();
    expect(portal.posts).toHaveLength(1);
    const body = new URLSearchParams(portal.posts[0]);
    expect(body.get("savegradesheet")).toBe("Save Gradesheet");
    expect(body.get("removestudents")).toBeNull();
    expect(portal.students.map((s) => s.grade)).toEqual(["1.50", "2.00", "INC", "", "3.00", ""]);
  });

  test("an applied grade the portal does not keep is reported, and so is a change nobody asked for", async () => {
    portal.onSave = (students) => {
      students[1].grade = ""; // the server drops BRAVO's grade
      students[3].grade = "5.00"; // and changes DELTA's by itself
    };
    const page = await open(context);
    await paste(page, SAMPLE);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Fill and save gradesheet" }).click();

    await expect(page.getByText("3 of 4 match. 1 differ or are missing, and 1 other grade(s) changed that you did not ask for.")).toBeVisible();
    await expect(page.getByRole("row", { name: /99-000002.*2\.00.*---/ })).toBeVisible();
    await expect(page.getByRole("row", { name: /99-000004.*---.*5\.00/ })).toBeVisible();
  });

  test("filling without saving sets the dropdowns, fires the portal's change handlers and posts nothing", async () => {
    const page = await open(context);
    await paste(page, SAMPLE);
    await page.getByRole("button", { name: /Fill 3 grades/ }).click();

    expect(await selectValue(page, 9001)).toBe("1.50");
    expect(await selectValue(page, 9003)).toBe("INC");
    expect(await selectValue(page, 9004)).toBe("0"); // invalid grade: untouched
    expect(await page.evaluate(() => (window as unknown as { __changes: number }).__changes)).toBe(3);
    await expect(page.locator("#rem_9001")).toHaveText("Passed");
    expect(portal.posts).toHaveLength(0);

    // The person never saved; coming back later, the check says the portal does not have the grades.
    await page.reload();
    await page.getByRole("button", { name: "Vantage grade push" }).click();
    await page.getByRole("button", { name: "Check the portal" }).click();
    await expect(page.getByText("1 of 4 match. 3 differ or are missing.")).toBeVisible();
  });

  test("a headerless paste is read from the cells, and the columns can be corrected", async () => {
    const page = await open(context);
    await paste(page, tsv([["99-000001", "Alpha, Anna Test", "1.75"], ["99-000002", "Bravo, Ben Test", "2.25"]]));
    await expect(page.getByText("No header row found")).toBeVisible();
    await expect(page.getByText("2 to change")).toBeVisible();
    await page.getByLabel("Final grade").selectOption("0"); // wrong column on purpose
    await expect(page.getByText("cannot be applied")).toBeVisible();
  });

  test("a repeated student with different grades is refused, not guessed", async () => {
    const page = await open(context);
    await paste(page, tsv([["Student Number", "Final Grade"], ["99-000001", "1.5"], ["99-000001", "2"]]));
    await expect(page.getByText("listed more than once with different grades").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Fill 0 grades/ })).toBeDisabled();
  });

  test("nothing is added to a page that is not a gradesheet form", async () => {
    portal.withSaveButton = false;
    const page = await context.newPage();
    await page.goto(SHEET_URL);
    await expect(page.locator("#vantage-mmsu-push")).toHaveCount(0);
  });
  // Regenerates the pictures used on the "MMSU Grade Push" page: MMSU_SCREENSHOTS=1 npx playwright test mmsuPush -g screenshots
  test("screenshots for the setup page", async () => {
    test.skip(!process.env.MMSU_SCREENSHOTS, "set MMSU_SCREENSHOTS=1 to regenerate the guide pictures");
    const outDir = join(frontendRoot, "public", "guides", "mmsu-grade-push");
    mkdirSync(outDir, { recursive: true });
    const shot = (name: string) => join(outDir, name);
    const panelOf = (page: Page) => page.locator("#vantage-mmsu-push").locator(".panel");

    // The extensions page with the extension loaded.
    const extensions = await context.newPage();
    await extensions.goto("chrome://extensions");
    await extensions.locator("extensions-manager").locator("extensions-toolbar").locator("#devMode").click();
    await extensions.waitForTimeout(500);
    await extensions.screenshot({ path: shot("01-developer-mode.png"), clip: { x: 0, y: 0, width: 1280, height: 112 } });
    await extensions.screenshot({ path: shot("02-extension-loaded.png"), clip: { x: 330, y: 165, width: 430, height: 260 } });
    await extensions.close();

    // The tab on the right edge of a gradesheet page.
    const sheet = await context.newPage();
    await sheet.goto(SHEET_URL);
    await sheet.getByRole("button", { name: "Vantage grade push" }).waitFor();
    await sheet.screenshot({ path: shot("03-panel-tab.png"), clip: { x: 1100, y: 380, width: 180, height: 170 } });

    // Paste and review.
    await sheet.getByRole("button", { name: "Vantage grade push" }).click();
    await paste(sheet, SAMPLE);
    await expect(sheet.getByText("4 to change")).toBeVisible();
    await panelOf(sheet).screenshot({ path: shot("04-paste-and-review.png") });

    // Saved, and the portal matches.
    sheet.once("dialog", (dialog) => void dialog.accept());
    await sheet.getByRole("button", { name: "Fill and save gradesheet" }).click();
    await expect(sheet.getByText("All 4 grades on the portal match your sheet.")).toBeVisible();
    await panelOf(sheet).screenshot({ path: shot("05-check-all-match.png") });
    await sheet.close();

    // The portal did not keep everything.
    portal.students = freshStudents();
    portal.sheetId = nextSheetId++; // a different gradesheet, so the first one's result is not shown again
    portal.onSave = (students) => {
      students[1].grade = "";
      students[3].grade = "5.00";
    };
    const bad = await open(context);
    await paste(bad, SAMPLE);
    bad.once("dialog", (dialog) => void dialog.accept());
    await bad.getByRole("button", { name: "Fill and save gradesheet" }).click();
    await expect(bad.getByText(/3 of 4 match/)).toBeVisible();
    await panelOf(bad).screenshot({ path: shot("06-check-differences.png") });
  });
});
