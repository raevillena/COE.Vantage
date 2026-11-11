import { test, expect } from "@playwright/test";
import { API, PASSWORD, ensureCeClass, removeCeClass, login } from "./support";

test.describe("schedule share links and calendar export", () => {
  test("a link opens a read-only page and a calendar file, and stops working when turned off", async ({ page, request }) => {
    test.setTimeout(90_000);
    const auth = await request.post(`${API}/auth/login`, { data: { email: "chairman@coe.vantage", password: PASSWORD } });
    const headers = { Authorization: `Bearer ${((await auth.json()) as { accessToken: string }).accessToken}` };
    const get = async <T>(path: string) => (await (await request.get(`${API}${path}`, { headers })).json()) as T;
    const cls = await ensureCeClass(request);
    const ay = await get<{ id: string }>("/academic-years/active");
    const faculty = (await get<{ id: string; name: string }[]>("/users?role=FACULTY")).find((u) => u.name.includes("Maria Santos"));
    const subject = (await get<{ id: string; code: string }[]>("/subjects")).find((s) => s.code === "CE101");
    const room = (await get<{ id: string; name: string }[]>("/rooms")).find((r) => r.name === "CE-201");
    test.skip(!cls || !faculty || !subject || !room, "needs the seeded CE data");
    let loadId = "";
    let linkId = "";
    try {
      const made = await request.post(`${API}/faculty-loads`, {
        headers,
        data: { facultyId: faculty!.id, subjectId: subject!.id, studentClassId: cls!.id, roomId: room!.id, dayOfWeek: 2, startTime: "16:00", endTime: "17:00", semester: 1, academicYearId: ay.id },
      });
      test.skip(made.status() !== 201, "needs a free Tuesday 4 PM slot");
      loadId = ((await made.json()) as { id: string }).id;

      const created = await request.post(`${API}/schedule-share`, { headers, data: { kind: "CLASS", targetId: cls!.id } });
      expect(created.status(), await created.text()).toBe(201);
      const link = (await created.json()) as { id: string; token: string; pageUrl: string; calendarUrl: string };
      linkId = link.id;
      expect(link.token.length).toBeGreaterThan(30);

      // the public JSON and the calendar need no sign-in
      const anon = await request.get(`${API}/public/schedule/${link.token}`);
      expect(anon.status()).toBe(200);
      const body = (await anon.json()) as { title: string; blocks: { subjectCode: string; startTime: string }[] };
      expect(body.title).toContain(cls!.name);
      // the Current Semester decides which blocks show, so the checks below follow what the page returned
      const ics = await request.get(`${API}/public/schedule/${link.token}/calendar.ics`);
      expect(ics.status()).toBe(200);
      expect(ics.headers()["content-type"]).toContain("text/calendar");
      const text = await ics.text();
      expect(text).toContain("BEGIN:VCALENDAR");
      expect(text).toContain("END:VCALENDAR");
      expect((text.match(/BEGIN:VEVENT/g) ?? []).length).toBe(body.blocks.length);
      if (body.blocks.length > 0) {
        expect(text).toContain("RRULE:FREQ=WEEKLY");
        expect(text).toContain("DTSTART;TZID=Asia/Manila:");
      }
      for (const line of text.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);

      // the share page
      await page.goto(`/s/${link.token}`);
      await expect(page.getByRole("heading", { name: new RegExp(cls!.name) })).toBeVisible();
      await expect(page.getByRole("link", { name: "Add to calendar" })).toBeVisible();

      // listed for its owner; the stored value is a hash, never the token
      const mine = await get<{ id: string }[]>(`/schedule-share?kind=CLASS&targetId=${cls!.id}`);
      expect(mine.some((l) => l.id === link.id)).toBe(true);
      expect(JSON.stringify(mine)).not.toContain(link.token);
      // another person cannot turn it off, make a class link, or share someone else's schedule
      const other = await request.post(`${API}/auth/login`, { data: { email: "faculty1@coe.vantage", password: PASSWORD } });
      const otherHeaders = { Authorization: `Bearer ${((await other.json()) as { accessToken: string }).accessToken}` };
      expect((await request.delete(`${API}/schedule-share/${link.id}`, { headers: otherHeaders })).status()).toBe(403);
      expect((await request.post(`${API}/schedule-share`, { headers: otherHeaders, data: { kind: "CLASS", targetId: cls!.id } })).status()).toBe(403);
      const carlos = (await get<{ id: string; name: string }[]>("/users?role=FACULTY")).find((u) => u.name.includes("Carlos Reyes"));
      if (carlos) expect((await request.post(`${API}/schedule-share`, { headers: otherHeaders, data: { kind: "FACULTY", targetId: carlos.id } })).status()).toBe(403);

      // turned off: the same address no longer works
      expect((await request.delete(`${API}/schedule-share/${link.id}`, { headers })).status()).toBe(200);
      expect((await request.get(`${API}/public/schedule/${link.token}`)).status()).toBe(404);
      expect((await request.get(`${API}/public/schedule/${link.token}/calendar.ics`)).status()).toBe(404);
      await page.goto(`/s/${link.token}`);
      await expect(page.getByText("This link is not active")).toBeVisible();
      expect((await request.get(`${API}/public/schedule/${"x".repeat(43)}`)).status()).toBe(404);
    } finally {
      if (linkId) await request.delete(`${API}/schedule-share/${linkId}`, { headers });
      if (loadId) await request.delete(`${API}/faculty-loads/${loadId}`, { headers });
      await removeCeClass(request);
    }
  });

  test("the Share / calendar dialog makes a link and turns it off", async ({ page, request }) => {
    // earlier failed runs may have left links of this account: turn them all off first
    const me = await request.post(`${API}/auth/login`, { data: { email: "faculty1@coe.vantage", password: PASSWORD } });
    const mine = { Authorization: `Bearer ${((await me.json()) as { accessToken: string }).accessToken}` };
    for (const l of (await (await request.get(`${API}/schedule-share`, { headers: mine })).json()) as { id: string }[]) await request.delete(`${API}/schedule-share/${l.id}`, { headers: mine });
    await login(page, "faculty1@coe.vantage");
    await page.goto("/dashboard");
    const button = page.getByRole("button", { name: /Share or add to calendar/ });
    await expect(button).toBeVisible({ timeout: 15_000 });
    await button.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Make a new link" }).click();
    await expect(dialog.getByRole("textbox", { name: "Schedule page" })).toHaveValue(/\/s\//);
    await expect(dialog.getByRole("textbox", { name: /Calendar file/ })).toHaveValue(/calendar\.ics$/);
    await dialog.getByRole("button", { name: /Turn off the link made/ }).first().click();
    await expect(dialog.getByText("No active links.")).toBeVisible();
  });
});
