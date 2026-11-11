import { test, expect } from "@playwright/test";
import { API, PASSWORD, CE_CLASS, ensureCeClass, removeCeClass, login } from "./support";

test("the Code dialog lists the same subject's blocks together, not scattered by day", async ({ page, request }) => {
  test.setTimeout(90_000);
  const auth = await request.post(`${API}/auth/login`, { data: { email: "chairman@coe.vantage", password: PASSWORD } });
  const headers = { Authorization: `Bearer ${((await auth.json()) as { accessToken: string }).accessToken}` };
  const get = async <T>(path: string) => (await (await request.get(`${API}${path}`, { headers })).json()) as T;
  const cls = await ensureCeClass(request);
  const ay = await get<{ id: string }>("/academic-years/active");
  const faculty = (await get<{ id: string; name: string }[]>("/users?role=FACULTY")).find((u) => u.name.includes("Maria Santos"));
  const subjects = await get<{ id: string; code: string }[]>("/subjects");
  const [one, two] = ["CE101", "CE401"].map((c) => subjects.find((s) => s.code === c));
  const room = (await get<{ id: string; name: string }[]>("/rooms")).find((r) => r.name === "CE-201");
  test.skip(!cls || !faculty || !one || !two || !room, "needs the seeded CE data");
  const created: string[] = [];
  try {
    // two subjects on alternating days: by day they would interleave (A B A B)
    const days: [number, typeof one][] = [[1, one], [2, two], [3, one], [4, two]];
    for (const [dayOfWeek, subject] of days) {
      const r = await request.post(`${API}/faculty-loads`, {
        headers,
        data: { studentClassId: cls!.id, semester: 1, academicYearId: ay.id, subjectId: subject!.id, roomId: room!.id, facultyId: faculty!.id, dayOfWeek, startTime: "16:00", endTime: "17:00" },
      });
      test.skip(r.status() !== 201, "needs free 4 PM slots Monday to Thursday");
      created.push(((await r.json()) as { id: string }).id);
    }
    await login(page, "chairman@coe.vantage");
    await page.goto("/scheduler");
    await page.getByText("Select class").first().click();
    await page.getByRole("option", { name: CE_CLASS }).click();
    await page.getByRole("button", { name: "Edit blocks as a list" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Raw blocks")).toBeVisible();
    const codes = (await dialog.locator("tbody tr td:first-child").allInnerTexts()).map((t) => t.split("\n")[0].trim());
    expect(codes).toEqual(["CE101", "CE101", "CE401", "CE401"]);
  } finally {
    for (const id of created.reverse()) await request.delete(`${API}/faculty-loads/${id}`, { headers });
    await removeCeClass(request);
  }
});
