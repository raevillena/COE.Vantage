import { test, expect } from "@playwright/test";
import { API, PASSWORD, ensureCeClass, login, removeCeClass } from "./support";

test.describe("scheduler: a block cannot have zero or negative hours", () => {
  test("the server refuses an end time that is not after the start, on create, update and preview", async ({ request }) => {
    test.setTimeout(90_000);
    const login = await request.post(`${API}/auth/login`, { data: { email: "chairman@coe.vantage", password: PASSWORD } });
    const headers = { Authorization: `Bearer ${((await login.json()) as { accessToken: string }).accessToken}` };
    const get = async <T>(path: string) => (await (await request.get(`${API}${path}`, { headers })).json()) as T;
    const cls = await ensureCeClass(request);
    const ay = await get<{ id: string }>("/academic-years/active");
    const faculty = (await get<{ id: string; name: string }[]>("/users?role=FACULTY")).find((u) => u.name.includes("Maria Santos"));
    const subject = (await get<{ id: string; code: string }[]>("/subjects")).find((s) => s.code === "CE101");
    const room = (await get<{ id: string; name: string }[]>("/rooms")).find((r) => r.name === "CE-201");
    test.skip(!cls || !faculty || !subject || !room, "needs the seeded CE data");
    const base = { facultyId: faculty!.id, subjectId: subject!.id, studentClassId: cls!.id, roomId: room!.id, dayOfWeek: 5, semester: 1, academicYearId: ay.id };
    let id = "";
    try {
      for (const [startTime, endTime] of [["10:00", "09:00"], ["10:00", "10:00"], ["12:30", "00:30"]]) {
        const res = await request.post(`${API}/faculty-loads`, { headers, data: { ...base, startTime, endTime } });
        expect(res.status(), `${startTime}-${endTime}`).toBe(400);
        expect(await res.text()).toContain("end time must be after the start time");
        const preview = await request.post(`${API}/faculty-loads/preview`, { headers, data: { ...base, startTime, endTime } });
        expect(preview.status(), `preview ${startTime}-${endTime}`).toBe(400);
      }
      const ok = await request.post(`${API}/faculty-loads`, { headers, data: { ...base, startTime: "14:00", endTime: "15:00" } });
      expect(ok.status(), await ok.text()).toBe(201);
      id = ((await ok.json()) as { id: string }).id;
      const bad = await request.patch(`${API}/faculty-loads/${id}`, { headers, data: { endTime: "13:00" } });
      expect(bad.status()).toBe(400);
      const still = await get<{ startTime: string; endTime: string }>(`/faculty-loads/${id}`);
      expect([still.startTime, still.endTime]).toEqual(["14:00", "15:00"]);
    } finally {
      if (id) await request.delete(`${API}/faculty-loads/${id}`, { headers });
      await removeCeClass(request);
    }
  });

  test("the form warns and keeps Save off while the end is not after the start", async ({ page }) => {
    await login(page, "chairman@coe.vantage");
    await page.goto("/scheduler");
    await page.getByRole("button", { name: /Add load/ }).first().click();
    const dialog = page.getByRole("dialog");
    const times = dialog.locator('input[type="time"]');
    await times.nth(0).fill("10:00");
    await times.nth(1).fill("09:00");
    await expect(dialog.getByRole("alert").filter({ hasText: "negative length" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    await times.nth(1).fill("11:00");
    await expect(dialog.getByText(/negative length/)).toHaveCount(0);
  });
});
