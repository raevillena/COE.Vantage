import { test, expect } from "@playwright/test";
import { API, PASSWORD, login } from "./support";

// Local backend has no SMTP configured, so "sending" only logs to the console: nothing leaves the machine.
test.describe("grade emails: import and send", () => {
  test("emails are pasted in from a sheet, sent once each, and marked with a check", async ({ page, request }) => {
    test.setTimeout(120_000);
    const auth = await request.post(`${API}/auth/login`, { data: { email: "admin@coe.vantage", password: PASSWORD } });
    const headers = { Authorization: `Bearer ${((await auth.json()) as { accessToken: string }).accessToken}` };
    const prefs = (await (await request.get(`${API}/auth/me/experimental-features`, { headers })).json()) as { enabled: boolean; features: string[] };
    let subjectId = "";
    type Rec = { id: string; studentNumber: string; email: string | null; emailSentAt: string | null; code: string };
    const records = async () => (await (await request.get(`${API}/grade-subjects/${subjectId}/records`, { headers })).json()) as Rec[];
    try {
      await request.patch(`${API}/auth/me/experimental-features`, { headers, data: { enabled: true, features: Array.from(new Set([...prefs.features, "gradeModule"])) } });
      subjectId = ((await (await request.post(`${API}/grade-subjects`, { headers, data: { name: "QA Email Import" } })).json()) as { id: string }).id;
      for (const [name, no] of [["EMAILONE, QA", "99-884001"], ["EMAILTWO, QA", "99-884002"], ["EMAILTHREE, QA", "99-884003"]]) {
        const r = await request.post(`${API}/grade-subjects/${subjectId}/records`, { headers, data: { studentName: name, studentNumber: no, grades: { Q1: 5 }, maxScores: { Q1: 10 } } });
        expect(r.status(), await r.text()).toBe(201);
      }
      const codesBefore = new Map((await records()).map((r) => [r.studentNumber, r.code]));

      await login(page, "admin@coe.vantage");
      await page.goto("/experimental/grades");
      await page.getByRole("button", { name: "QA Email Import", exact: true }).click();

      // ---- import emails: header row, columns in a different order, one unknown student, one bad address, one other name
      await page.getByRole("button", { name: "Import emails", exact: true }).click();
      const importDialog = page.getByRole("dialog");
      await importDialog.getByLabel("Pasted sheet rows").fill(
        [
          "Email\tName\tStudent Number",
          "one@example.com\tEMAILONE, QA\t99-884001",
          "two@example.com\tSomebody Else\t99-884002",
          "not-an-email\tEMAILTHREE, QA\t99-884003",
          "ghost@example.com\tNO SUCH\t99-884999",
        ].join("\n")
      );
      await expect(importDialog.getByText("4 rows read.")).toBeVisible();
      await importDialog.getByRole("button", { name: "Import emails", exact: true }).click();
      await expect(importDialog.getByText("2 emails saved, 0 already the same.")).toBeVisible();
      await expect(importDialog.getByText(/Not in this subject \(1\): 99-884999/)).toBeVisible();
      await expect(importDialog.getByText(/Not a valid email \(1\): 99-884003/)).toBeVisible();
      await expect(importDialog.getByText(/the name differs \(1\)/)).toBeVisible();
      const after = await records();
      expect(after.find((r) => r.studentNumber === "99-884001")?.email).toBe("one@example.com");
      expect(after.find((r) => r.studentNumber === "99-884002")?.email).toBe("two@example.com");
      expect(after.find((r) => r.studentNumber === "99-884003")?.email).toBeNull();
      for (const r of after) expect(r.code).toBe(codesBefore.get(r.studentNumber)); // access codes untouched
      expect(after).toHaveLength(3); // nothing created
      await importDialog.getByRole("button", { name: "Close", exact: true }).first().click();

      // ---- send: 2 have an email, 1 has none
      await expect(page.getByRole("img", { name: "Access email sent" })).toHaveCount(0);
      await page.getByRole("button", { name: "Send access emails", exact: true }).click();
      const sendDialog = page.getByRole("dialog");
      await expect(sendDialog.getByText(/Of 3 records: 2 have an email, 0 already emailed, so 2 would be sent/)).toBeVisible();
      await sendDialog.getByRole("button", { name: "Send to all records" }).click();
      await expect(sendDialog.getByText(/Done\. 2 of 2 sent/)).toBeVisible({ timeout: 20_000 });
      await expect(sendDialog.getByText(/1 without a valid email/)).toBeVisible();
      await sendDialog.getByRole("button", { name: "Close", exact: true }).first().click();
      await expect(page.getByRole("img", { name: "Access email sent" })).toHaveCount(2);
      expect((await records()).filter((r) => r.emailSentAt).length).toBe(2);

      // ---- Reload picks up a change made elsewhere
      await request.post(`${API}/grade-subjects/${subjectId}/records/import-emails`, { headers, data: { rows: [{ studentNumber: "99-884003", email: "three@example.com" }] } });
      await page.getByRole("button", { name: "Reload", exact: true }).click();
      await expect(page.getByText("three@example.com")).toBeVisible();

      // ---- sending again leaves the two already-emailed students out and sends only to the newly added address
      await page.getByRole("button", { name: "Send access emails", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Send to all records" }).click();
      await expect(page.getByRole("dialog").getByText(/Done\. 1 of 1 sent/)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("dialog").getByText(/2 already emailed/)).toBeVisible();
      await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).first().click();

      // ---- a changed address clears "sent" so the new address gets the code
      await request.post(`${API}/grade-subjects/${subjectId}/records/import-emails`, { headers, data: { rows: [{ studentNumber: "99-884001", email: "uno@example.com" }] } });
      expect((await records()).find((r) => r.studentNumber === "99-884001")?.emailSentAt).toBeNull();
    } finally {
      if (subjectId) await request.delete(`${API}/grade-subjects/${subjectId}`, { headers });
      await request.patch(`${API}/auth/me/experimental-features`, { headers, data: { enabled: prefs.enabled, features: prefs.features } });
    }
  });
});
