import { test, expect, type APIRequestContext } from "@playwright/test";
import { API, PASSWORD } from "./support";

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

test.describe("exam room reservation", () => {
  test("rounds open for plotting, first plotted first served, and chairmen free blocks in their rooms", async ({ request }) => {
    test.setTimeout(120_000);
    const admin = await signIn(request, "admin@coe.vantage");
    const adminCollege = { ...admin.headers, "X-College-Id": COE };
    const secretary = await signIn(request, "secretary@coe.vantage");
    const chairman = await signIn(request, "chairman@coe.vantage");
    const faculty = await signIn(request, "faculty1@coe.vantage");
    const otherFaculty = await signIn(request, "faculty2@coe.vantage");

    const get = async <T,>(path: string, who: Session) => (await (await request.get(`${API}${path}`, { headers: who.headers })).json()) as T;
    const ay = await get<{ id: string }>("/academic-years/active", chairman);
    const semester = 1;
    const subject = (await get<{ id: string; code: string; curriculumId: string }[]>("/subjects", chairman)).find((s) => s.code === "CE101");
    test.skip(!subject, "needs the seeded CE101 subject");

    const loads: string[] = [];
    const classes: string[] = [];
    const reservations: string[] = [];
    let periodId = "";
    try {
      // two QA classes of the CE curriculum, both taught by faculty1
      const makeClass = async (name: string) => {
        const r = await request.post(`${API}/student-classes`, { headers: adminCollege, data: { name, yearLevel: 4, curriculumId: subject!.curriculumId, studentCount: 30 } });
        expect(r.status(), await r.text()).toBe(201);
        const id = ((await r.json()) as { id: string }).id;
        classes.push(id);
        return id;
      };
      const classA = await makeClass("QA Exam Class A");
      const classB = await makeClass("QA Exam Class B");
      const rooms = await get<{ id: string; name: string; departmentId: string }[]>("/exam-rooms/rooms", faculty);
      expect(rooms.length).toBeGreaterThan(1);
      // a room of the chairman's own department, and a room of another department (or just another room)
      const ownRoom = rooms.find((r) => r.departmentId === chairman.user.departmentId);
      test.skip(!ownRoom, "needs a room in the chairman's department");
      const otherRoom = rooms.find((r) => r.id !== ownRoom!.id)!;
      const facultyId = faculty.user.id;
      for (const [cls, hr] of [[classA, 16], [classB, 17]] as const) {
        const r = await request.post(`${API}/faculty-loads`, {
          headers: chairman.headers,
          data: { facultyId, subjectId: subject!.id, studentClassId: cls, roomId: ownRoom!.id, dayOfWeek: 6, startTime: `${hr}:00`, endTime: `${hr + 1}:00`, semester, academicYearId: ay.id },
        });
        expect(r.status(), await r.text()).toBe(201);
        loads.push(((await r.json()) as { id: string }).id);
      }

      const base = { academicYearId: ay.id, semester, kind: "MIDTERM", subjectId: subject!.id };
      const reserve = (who: Session, extra: Record<string, unknown>) => request.post(`${API}/exam-rooms/reservations`, { headers: who.headers, data: { ...base, ...extra } });

      // ---- the college secretary sets the dates and opens the round; faculty cannot
      expect((await request.put(`${API}/exam-rooms/periods`, { headers: faculty.headers, data: { academicYearId: ay.id, semester, kind: "MIDTERM", startDate: "2026-12-14", endDate: "2026-12-19" } })).status()).toBe(403);
      const set = await request.put(`${API}/exam-rooms/periods`, { headers: secretary.headers, data: { academicYearId: ay.id, semester, kind: "MIDTERM", startDate: "2026-12-14", endDate: "2026-12-19" } });
      expect(set.status(), await set.text()).toBe(200);
      periodId = ((await set.json()) as { id: string; isOpen: boolean }).id;
      expect(((await set.json()) as { isOpen: boolean }).isOpen).toBe(false);

      // closed: nothing can be plotted yet
      const closed = await reserve(faculty, { roomId: ownRoom!.id, studentClassId: classA, date: "2026-12-15", startTime: "09:00", endTime: "10:30" });
      expect(closed.status()).toBe(400);
      expect(await closed.text()).toContain("not open");
      expect((await request.put(`${API}/exam-rooms/periods/${periodId}/open`, { headers: chairman.headers, data: { open: true } })).status()).toBe(403); // only the secretary
      expect((await request.put(`${API}/exam-rooms/periods/${periodId}/open`, { headers: secretary.headers, data: { open: true } })).status()).toBe(200);

      // ---- plotting
      const first = await reserve(faculty, { roomId: ownRoom!.id, studentClassId: classA, date: "2026-12-15", startTime: "09:00", endTime: "10:30" });
      expect(first.status(), await first.text()).toBe(201);
      const firstId = ((await first.json()) as { id: string }).id;
      reservations.push(firstId);

      // a day outside the round is refused; times must be sensible
      expect((await reserve(faculty, { roomId: ownRoom!.id, studentClassId: classA, date: "2026-12-30", startTime: "09:00", endTime: "10:00" })).status()).toBe(400);
      expect((await reserve(faculty, { roomId: ownRoom!.id, studentClassId: classA, date: "2026-12-16", startTime: "10:00", endTime: "09:00" })).status()).toBe(400);
      // someone who does not teach the class cannot plot it
      expect((await reserve(otherFaculty, { roomId: ownRoom!.id, studentClassId: classA, date: "2026-12-16", startTime: "09:00", endTime: "10:00" })).status()).toBe(403);

      // first plotted, first served: the same room at an overlapping time is taken, a touching time is free
      const clash = await reserve(faculty, { roomId: ownRoom!.id, studentClassId: classB, date: "2026-12-15", startTime: "10:00", endTime: "11:00" });
      expect(clash.status()).toBe(409);
      expect(await clash.text()).toContain("already taken");
      const touching = await reserve(faculty, { roomId: ownRoom!.id, studentClassId: classB, date: "2026-12-15", startTime: "10:30", endTime: "12:00" });
      expect(touching.status(), await touching.text()).toBe(201);
      reservations.push(((await touching.json()) as { id: string }).id);

      // the same class cannot sit two exams at once, even in another room
      const classClash = await reserve(faculty, { roomId: otherRoom.id, studentClassId: classA, date: "2026-12-15", startTime: "10:00", endTime: "11:00" });
      expect(classClash.status()).toBe(409);
      expect(await classClash.text()).toContain("already has an exam");

      // one teacher can have several rooms at the same time (a proctor can be asked for): class B in another room while class A is in session
      const parallel = await reserve(faculty, { roomId: otherRoom.id, studentClassId: classB, date: "2026-12-16", startTime: "09:00", endTime: "10:30" });
      expect(parallel.status(), await parallel.text()).toBe(201);
      const parallelId = ((await parallel.json()) as { id: string }).id;
      reservations.push(parallelId);
      const sameTimeA = await reserve(faculty, { roomId: ownRoom!.id, studentClassId: classA, date: "2026-12-16", startTime: "09:00", endTime: "10:30" });
      expect(sameTimeA.status(), await sameTimeA.text()).toBe(201);
      reservations.push(((await sameTimeA.json()) as { id: string }).id);

      // the page's lists
      const mine = await get<{ subjectId: string; studentClassId: string; reserved: { MIDTERM: number } }[]>(`/exam-rooms/my-items?academicYearId=${ay.id}&semester=${semester}`, faculty);
      expect(mine.find((i) => i.studentClassId === classA)?.reserved.MIDTERM).toBe(2);
      const listed = await get<{ id: string; ownerName: string }[]>(`/exam-rooms/reservations?academicYearId=${ay.id}&semester=${semester}&kind=MIDTERM`, otherFaculty);
      expect(listed.some((r) => r.id === firstId)).toBe(true); // everyone sees who holds what

      // ---- removing blocks
      // other faculty cannot remove it; the owner can; the chairman of the room's department can by force
      expect((await request.delete(`${API}/exam-rooms/reservations/${firstId}`, { headers: otherFaculty.headers })).status()).toBe(403);
      // the chairman of another department could not: use the dean (not the room's chairman) to prove it is not just any manager
      const dean = await signIn(request, "dean@coe.vantage");
      expect((await request.delete(`${API}/exam-rooms/reservations/${firstId}`, { headers: dean.headers })).status()).toBe(403);

      // a request: only the chairman of the room's department; the owner may decline, then accept
      expect((await request.post(`${API}/exam-rooms/reservations/${firstId}/removal-request`, { headers: faculty.headers, data: {} })).status()).toBe(403);
      const asked = await request.post(`${API}/exam-rooms/reservations/${firstId}/removal-request`, { headers: chairman.headers, data: { message: "Need the room for a make-up exam" } });
      expect(asked.status(), await asked.text()).toBe(201);
      const requestId = ((await asked.json()) as { id: string }).id;
      expect((await request.post(`${API}/exam-rooms/reservations/${firstId}/removal-request`, { headers: chairman.headers, data: {} })).status()).toBe(409); // one at a time
      const inbox = await get<{ incoming: { id: string }[]; outgoing: { id: string }[] }>("/exam-rooms/removal-requests", faculty);
      expect(inbox.incoming.map((q) => q.id)).toContain(requestId);
      expect((await request.post(`${API}/exam-rooms/removal-requests/${requestId}/respond`, { headers: otherFaculty.headers, data: { accept: true } })).status()).toBe(403); // not theirs
      expect((await request.post(`${API}/exam-rooms/removal-requests/${requestId}/respond`, { headers: faculty.headers, data: { accept: false, note: "My students need it" } })).status()).toBe(204);
      const afterDecline = await get<{ outgoing: { id: string; status: string }[] }>("/exam-rooms/removal-requests", chairman);
      expect(afterDecline.outgoing.find((q) => q.id === requestId)?.status).toBe("DECLINED");

      // ask again, this time accepted: the block is gone
      const again = await request.post(`${API}/exam-rooms/reservations/${firstId}/removal-request`, { headers: chairman.headers, data: {} });
      expect(again.status(), await again.text()).toBe(201);
      expect((await request.post(`${API}/exam-rooms/removal-requests/${((await again.json()) as { id: string }).id}/respond`, { headers: faculty.headers, data: { accept: true } })).status()).toBe(204);
      const afterAccept = await get<{ id: string }[]>(`/exam-rooms/reservations?academicYearId=${ay.id}&semester=${semester}&kind=MIDTERM`, faculty);
      expect(afterAccept.some((r) => r.id === firstId)).toBe(false);
      reservations.splice(reservations.indexOf(firstId), 1);

      // the chairman of the room's department removes a block by force
      const forced = reservations[reservations.length - 1];
      expect((await request.delete(`${API}/exam-rooms/reservations/${forced}`, { headers: chairman.headers })).status()).toBe(204);
      reservations.pop();

      // the round cannot lose its dates under blocks, and cannot be deleted while it holds blocks
      const shrink = await request.put(`${API}/exam-rooms/periods`, { headers: secretary.headers, data: { academicYearId: ay.id, semester, kind: "MIDTERM", startDate: "2026-12-18", endDate: "2026-12-19" } });
      expect(shrink.status()).toBe(409);
      expect((await request.delete(`${API}/exam-rooms/periods/${periodId}`, { headers: secretary.headers })).status()).toBe(409);

      // closing the round stops new blocks
      expect((await request.put(`${API}/exam-rooms/periods/${periodId}/open`, { headers: secretary.headers, data: { open: false } })).status()).toBe(200);
      expect((await reserve(faculty, { roomId: otherRoom.id, studentClassId: classA, date: "2026-12-17", startTime: "09:00", endTime: "10:00" })).status()).toBe(400);
    } finally {
      for (const id of reservations) await request.delete(`${API}/exam-rooms/reservations/${id}`, { headers: admin.headers });
      if (periodId) await request.delete(`${API}/exam-rooms/periods/${periodId}`, { headers: secretary.headers });
      for (const id of loads) await request.delete(`${API}/faculty-loads/${id}`, { headers: chairman.headers });
      for (const id of classes) {
        await request.delete(`${API}/student-classes/${id}`, { headers: adminCollege });
        await request.delete(`${API}/student-classes/trash/${id}`, { headers: adminCollege });
      }
    }
  });
});
