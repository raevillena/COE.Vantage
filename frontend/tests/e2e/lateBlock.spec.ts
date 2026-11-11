import { test, expect } from "@playwright/test";
import { API, PASSWORD, CE_CLASS, ensureCeClass, removeCeClass, login } from "./support";

test("a block after 6 PM opens the evening rows by itself, so it is not hidden", async ({ page, request }) => {
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
  let id = "";
  try {
    const r = await request.post(`${API}/faculty-loads`, {
      headers,
      data: { studentClassId: cls!.id, semester: 1, academicYearId: ay.id, subjectId: subject!.id, roomId: room!.id, facultyId: faculty!.id, dayOfWeek: 2, startTime: "20:02", endTime: "21:00" },
    });
    test.skip(r.status() !== 201, "needs a free Tuesday evening slot");
    id = ((await r.json()) as { id: string }).id;
    await login(page, "chairman@coe.vantage");
    await page.goto("/scheduler");
    await page.getByText("Select class").first().click();
    await page.getByRole("option", { name: CE_CLASS }).click();
    await expect(page.getByRole("button", { name: "Hide hours after 6 PM" })).toBeVisible();
    await expect(page.getByText("CE101").first()).toBeVisible();
  } finally {
    if (id) await request.delete(`${API}/faculty-loads/${id}`, { headers });
    await removeCeClass(request);
  }
});
