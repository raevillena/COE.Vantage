import { test, expect, type APIRequestContext } from "@playwright/test";
import { API, PASSWORD, login } from "./support";

const COE = "00000000-0000-0000-0000-0000000000a2";

interface Session {
  headers: Record<string, string>;
  user: { id: string; departmentId: string | null; role: string };
}

async function signIn(request: APIRequestContext, email: string): Promise<Session> {
  const r = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
  const body = (await r.json()) as { accessToken: string; user: Session["user"] };
  return { headers: { Authorization: `Bearer ${body.accessToken}` }, user: body.user };
}

test.describe("exam room reservation page", () => {
  test("plot by click and by drag, the room's chairman asks, the owner accepts", async ({ browser, request }) => {
    test.setTimeout(150_000);
    const admin = await signIn(request, "admin@coe.vantage");
    const adminCollege = { ...admin.headers, "X-College-Id": COE };
    const secretary = await signIn(request, "secretary@coe.vantage");
    const chairman = await signIn(request, "chairman@coe.vantage");
    const faculty = await signIn(request, "faculty1@coe.vantage");
    const get = async <T,>(path: string, who: Session) => (await (await request.get(`${API}${path}`, { headers: who.headers })).json()) as T;
    const ay = await get<{ id: string }>("/academic-years/active", chairman);
    const subject = (await get<{ id: string; code: string; curriculumId: string }[]>("/subjects", chairman)).find((s) => s.code === "CE101");
    test.skip(!subject, "needs the seeded CE101 subject");
    const rooms = await get<{ id: string; departmentId: string }[]>("/exam-rooms/rooms", faculty);
    const ownRoom = rooms.find((r) => r.departmentId === chairman.user.departmentId);
    test.skip(!ownRoom, "needs a room in the chairman's department");

    let classId = "";
    let loadId = "";
    let periodId = "";
    const contexts: { close: () => Promise<void> }[] = [];
    try {
      const cls = await request.post(`${API}/student-classes`, { headers: adminCollege, data: { name: "QA Exam Page Class", yearLevel: 4, curriculumId: subject!.curriculumId, studentCount: 30 } });
      classId = ((await cls.json()) as { id: string }).id;
      const load = await request.post(`${API}/faculty-loads`, {
        headers: chairman.headers,
        data: { facultyId: faculty.user.id, subjectId: subject!.id, studentClassId: classId, roomId: ownRoom!.id, dayOfWeek: 6, startTime: "15:00", endTime: "16:00", semester: 1, academicYearId: ay.id },
      });
      expect(load.status(), await load.text()).toBe(201);
      loadId = ((await load.json()) as { id: string }).id;
      const period = await request.put(`${API}/exam-rooms/periods`, { headers: secretary.headers, data: { academicYearId: ay.id, semester: 1, kind: "MIDTERM", startDate: "2026-12-14", endDate: "2026-12-19" } });
      periodId = ((await period.json()) as { id: string }).id;

      const open = async (email: string) => {
        const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
        contexts.push(context);
        const page = await context.newPage();
        page.setDefaultTimeout(10_000);
        await login(page, email);
        await page.goto("/exam-rooms");
        await page.getByLabel("Room", { exact: true }).selectOption(ownRoom!.id);
        return page;
      };

      // closed: the page says so and refuses a plot
      const facultyPage = await open("faculty1@coe.vantage");
      await expect(facultyPage.getByText("Closed: the college secretary opens it for plotting")).toBeVisible();
      await facultyPage.getByLabel("Subject CE101 QA Exam Page Class").click();
      await facultyPage.getByLabel("Plot on 2026-12-15 at 09:00").click();
      await expect(facultyPage.getByText("This round is not open yet")).toBeVisible();

      // the secretary opens it, from the page
      const secretaryPage = await open("secretary@coe.vantage");
      await secretaryPage.getByRole("button", { name: "Open for plotting" }).click();
      await expect(secretaryPage.getByText(/Open for plotting \(opened by/)).toBeVisible();

      // plot by clicking: pick the subject, then a time
      await facultyPage.reload();
      await facultyPage.getByLabel("Room", { exact: true }).selectOption(ownRoom!.id);
      await expect(facultyPage.getByText(/Open for plotting/)).toBeVisible();
      await facultyPage.getByLabel("Subject CE101 QA Exam Page Class").click();
      await facultyPage.getByLabel("Plot on 2026-12-15 at 09:00").click();
      await facultyPage.getByRole("dialog").getByRole("button", { name: "Reserve", exact: true }).click();
      await expect(facultyPage.getByRole("button", { name: /^Block CE101 QA Exam Page Class 2026-12-15 09:00 to 10:30/ })).toBeVisible();

      // plot by dragging a subject onto the grid
      const chip = facultyPage.getByLabel("Subject CE101 QA Exam Page Class");
      const cell = facultyPage.getByLabel("Plot on 2026-12-17 at 13:00");
      await cell.scrollIntoViewIfNeeded();
      const from = (await chip.boundingBox())!;
      const to = (await cell.boundingBox())!;
      await facultyPage.mouse.move(from.x + 20, from.y + 10);
      await facultyPage.mouse.down();
      await facultyPage.mouse.move(from.x + 40, from.y + 30, { steps: 4 });
      await facultyPage.mouse.move(to.x + 20, to.y + 8, { steps: 14 });
      await facultyPage.mouse.up();
      await facultyPage.getByRole("dialog").getByRole("button", { name: "Reserve", exact: true }).click();
      await expect(facultyPage.getByRole("button", { name: /^Block CE101 QA Exam Page Class 2026-12-17 13:00 to 14:30/ })).toBeVisible();

      // a taken time shows the server's reason
      await facultyPage.getByLabel("Subject CE101 QA Exam Page Class").click();
      await facultyPage.getByLabel("Plot on 2026-12-15 at 10:00").click();
      await facultyPage.getByRole("dialog").getByRole("button", { name: "Reserve", exact: true }).click();
      await expect(facultyPage.getByText(/already taken/)).toBeVisible();
      await facultyPage.keyboard.press("Escape");

      // the room's chairman asks the owner to free the first block
      const chairmanPage = await open("chairman@coe.vantage");
      await chairmanPage.getByRole("button", { name: /^Block CE101 QA Exam Page Class 2026-12-15 09:00 to 10:30/ }).click();
      await chairmanPage.getByLabel("Message to the owner").fill("Make-up exam needs this room");
      await chairmanPage.getByRole("button", { name: "Ask the owner to remove it" }).click();
      await expect(chairmanPage.getByText("Asked by you")).toBeVisible();

      // the owner sees the request and accepts: the block is gone
      await facultyPage.reload();
      await facultyPage.getByLabel("Room", { exact: true }).selectOption(ownRoom!.id);
      await expect(facultyPage.getByText("asks you to free it: Make-up exam needs this room")).toBeVisible();
      await facultyPage.getByRole("button", { name: "Accept and remove" }).click();
      await expect(facultyPage.getByRole("button", { name: /^Block CE101 QA Exam Page Class 2026-12-15 09:00/ })).toHaveCount(0);

      // the chairman removes the other block by force
      await chairmanPage.reload();
      await chairmanPage.getByLabel("Room", { exact: true }).selectOption(ownRoom!.id);
      await chairmanPage.getByRole("button", { name: /^Block CE101 QA Exam Page Class 2026-12-17 13:00/ }).click();
      await chairmanPage.getByRole("button", { name: "Remove now" }).click();
      await expect(chairmanPage.getByRole("button", { name: /^Block CE101 QA Exam Page Class 2026-12-17 13:00/ })).toHaveCount(0);
    } finally {
      for (const c of contexts) await c.close();
      const left = await get<{ id: string }[]>(`/exam-rooms/reservations?academicYearId=${ay.id}&semester=1&kind=MIDTERM`, admin);
      for (const r of left) await request.delete(`${API}/exam-rooms/reservations/${r.id}`, { headers: admin.headers });
      if (periodId) await request.delete(`${API}/exam-rooms/periods/${periodId}`, { headers: secretary.headers });
      if (loadId) await request.delete(`${API}/faculty-loads/${loadId}`, { headers: chairman.headers });
      if (classId) {
        await request.delete(`${API}/student-classes/${classId}`, { headers: adminCollege });
        await request.delete(`${API}/student-classes/trash/${classId}`, { headers: adminCollege });
      }
    }
  });
});
