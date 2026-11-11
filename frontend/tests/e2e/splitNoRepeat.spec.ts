import { test, expect } from "@playwright/test";
import { API, PASSWORD, CE_CLASS, ensureCeClass, removeCeClass, login } from "./support";

test("a block already split between instructors cannot be repeated on other days; an ordinary one still can", async ({ page, request }) => {
  test.setTimeout(90_000);
  const auth = await request.post(`${API}/auth/login`, { data: { email: "chairman@coe.vantage", password: PASSWORD } });
  const headers = { Authorization: `Bearer ${((await auth.json()) as { accessToken: string }).accessToken}` };
  const get = async <T>(path: string) => (await (await request.get(`${API}${path}`, { headers })).json()) as T;
  const cls = await ensureCeClass(request);
  const ay = await get<{ id: string }>("/academic-years/active");
  const users = await get<{ id: string; name: string }[]>("/users?role=FACULTY");
  const [fa, fb] = ["Maria Santos", "Revilla"].map((n) => users.find((u) => u.name.includes(n)));
  const subject = (await get<{ id: string; code: string }[]>("/subjects")).find((s) => s.code === "CE101");
  const room = (await get<{ id: string; name: string }[]>("/rooms")).find((r) => r.name === "CE-201");
  test.skip(!cls || !fa || !fb || !subject || !room, "needs the seeded CE data");
  const created: string[] = [];
  try {
    const base = { studentClassId: cls!.id, semester: 1, academicYearId: ay.id, subjectId: subject!.id, roomId: room!.id, dayOfWeek: 2, startTime: "16:00", endTime: "17:00" };
    const a = await request.post(`${API}/faculty-loads`, { headers, data: { ...base, facultyId: fa!.id } });
    test.skip(a.status() !== 201, "needs a free Tuesday 4 PM slot");
    const aId = ((await a.json()) as { id: string }).id;
    created.push(aId);

    const open = async () => {
      await page.goto("/scheduler");
      // the blocks are in the 1st semester, whichever semester the page opens on
      await page.getByRole("combobox", { name: "Scheduling Semester" }).click();
      await page.getByRole("option", { name: /1st Sem/ }).click();
      await page.getByRole("combobox", { name: "Student class" }).click();
      await page.getByRole("option", { name: CE_CLASS }).first().click();
      await page.locator("[data-draggable-block]:visible").first().click();
      await expect(page.getByText("Team teaching / split")).toBeVisible();
    };
    await login(page, "chairman@coe.vantage");

    // ordinary block: the repeat picker is there
    await open();
    await expect(page.getByRole("group", { name: /Repeats on/ })).toBeVisible();
    await expect(page.getByTestId("split-no-repeat")).toHaveCount(0);

    // pressing Split Class turns the repeat option off at once, before anything is saved
    await page.getByRole("button", { name: "Split Class" }).click();
    await expect(page.getByRole("note").filter({ hasText: "Split Class." })).toBeVisible();
    await expect(page.getByRole("group", { name: /repeat/i })).toHaveCount(0);
    await expect(page.getByTestId("split-no-repeat")).toBeVisible();

    // split it: both halves are now split blocks, so the picker goes and the note appears
    const b = await request.post(`${API}/faculty-loads`, { headers, data: { ...base, facultyId: fb!.id, splitOfLoadId: aId } });
    expect(b.status(), await b.text()).toBe(201);
    created.push(((await b.json()) as { id: string }).id);
    await open();
    await expect(page.getByRole("group", { name: /Repeats on/ })).toHaveCount(0);
    await expect(page.getByTestId("split-no-repeat")).toBeVisible();
  } finally {
    for (const id of created.reverse()) await request.delete(`${API}/faculty-loads/${id}`, { headers });
    await removeCeClass(request);
  }
});
