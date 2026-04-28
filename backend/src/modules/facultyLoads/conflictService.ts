import type { Prisma } from "@prisma/client";
import { prisma } from "../../prisma/client.js";
import { badRequest } from "../../utils/errors.js";
import type { PreviewFacultyLoadBody } from "./facultyLoadSchemas.js";

/** Time overlap: existing slot (s1,e1) overlaps new slot (s2,e2) when s1 < e2 AND e1 > s2 */
function timeOverlaps(
  existingStart: string,
  existingEnd: string,
  newStart: string,
  newEnd: string
): boolean {
  return existingStart < newEnd && existingEnd > newStart;
}

/** Compare start/end as HH:mm (handles optional :ss suffix from drivers). */
function sameClockSpan(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const clip = (t: string) => t.trim().slice(0, 5);
  return clip(aStart) === clip(bStart) && clip(aEnd) === clip(bEnd);
}

type SlotFields = {
  subjectId: string;
  studentClassId: string;
  roomId: string | null | undefined;
  roomDisplayName: string | null | undefined;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

/**
 * Same class time for team teaching: same class, subject, day, time span.
 * Room may differ (e.g. co-instructor in another space); those rows are not a student-class double-booking.
 */
function isTeamTeachingPeer(proposed: SlotFields, existing: SlotFields): boolean {
  return (
    existing.subjectId === proposed.subjectId &&
    existing.studentClassId === proposed.studentClassId &&
    existing.dayOfWeek === proposed.dayOfWeek &&
    sameClockSpan(proposed.startTime, proposed.endTime, existing.startTime, existing.endTime)
  );
}

export interface ConflictResult {
  facultyConflict: boolean;
  roomConflict: boolean;
  studentConflict: boolean;
  capacityIssue: boolean;
  labRoomMismatch: boolean;
}

/** Run all conflict checks for a proposed faculty load (create or update). Pass tx when inside a transaction.
 * When facultyId is null (off-system faculty), faculty conflict is skipped. When roomId is null (off-system room), room/capacity/lab checks are skipped. */
export async function checkConflicts(
  payload: PreviewFacultyLoadBody,
  tx?: Prisma.TransactionClient
): Promise<ConflictResult> {
  const { facultyId, subjectId, studentClassId, roomId, dayOfWeek, startTime, endTime, semester, academicYearId, excludeLoadId } = payload;
  const db = tx ?? prisma;
  const hasFaculty = facultyId != null && facultyId !== "";
  const hasRoom = roomId != null && roomId !== "";

  const [subject, studentClass, facultyLoadsForFaculty, facultyLoadsForRoom, facultyLoadsForClass] = await Promise.all([
    db.subject.findUniqueOrThrow({ where: { id: subjectId } }),
    db.studentClass.findUniqueOrThrow({ where: { id: studentClassId } }),
    hasFaculty
      ? db.facultyLoad.findMany({
          where: {
            facultyId: facultyId!,
            academicYearId,
            semester,
            dayOfWeek,
            ...(excludeLoadId ? { id: { not: excludeLoadId } } : {}),
          },
        })
      : Promise.resolve([]),
    hasRoom
      ? db.facultyLoad.findMany({
          where: {
            roomId: roomId!,
            academicYearId,
            semester,
            dayOfWeek,
            ...(excludeLoadId ? { id: { not: excludeLoadId } } : {}),
          },
        })
      : Promise.resolve([]),
    db.facultyLoad.findMany({
      where: {
        studentClassId,
        academicYearId,
        semester,
        dayOfWeek,
        ...(excludeLoadId ? { id: { not: excludeLoadId } } : {}),
      },
    }),
  ]);

  const room = hasRoom ? await db.room.findUniqueOrThrow({ where: { id: roomId! } }) : null;

  const proposedSlot: SlotFields = {
    subjectId,
    studentClassId,
    roomId,
    roomDisplayName: payload.roomDisplayName,
    dayOfWeek,
    startTime,
    endTime,
  };

  const facultyConflict = hasFaculty && facultyLoadsForFaculty.some((l) =>
    timeOverlaps(l.startTime, l.endTime, startTime, endTime)
  );
  const roomConflict =
    hasRoom &&
    facultyLoadsForRoom.some(
      (l) =>
        timeOverlaps(l.startTime, l.endTime, startTime, endTime) &&
        !isTeamTeachingPeer(proposedSlot, {
          subjectId: l.subjectId,
          studentClassId: l.studentClassId,
          roomId: l.roomId,
          roomDisplayName: l.roomDisplayName,
          dayOfWeek: l.dayOfWeek,
          startTime: l.startTime,
          endTime: l.endTime,
        })
    );
  const studentConflict = facultyLoadsForClass.some(
    (l) =>
      timeOverlaps(l.startTime, l.endTime, startTime, endTime) &&
      !isTeamTeachingPeer(proposedSlot, {
        subjectId: l.subjectId,
        studentClassId: l.studentClassId,
        roomId: l.roomId,
        roomDisplayName: l.roomDisplayName,
        dayOfWeek: l.dayOfWeek,
        startTime: l.startTime,
        endTime: l.endTime,
      })
  );
  const capacityIssue = room !== null && room.capacity < studentClass.studentCount;
  const labRoomMismatch = room !== null && subject.isLab && !room.isLab;

  return {
    facultyConflict,
    roomConflict,
    studentConflict,
    capacityIssue,
    labRoomMismatch,
  };
}

/** Throws if any conflict; used inside transaction before create/update. */
export function assertNoConflicts(result: ConflictResult): void {
  const messages: string[] = [];
  if (result.facultyConflict) messages.push("Faculty has another class at this time");
  if (result.roomConflict) messages.push("Room is already in use at this time");
  if (result.studentConflict) messages.push("Student class has another class at this time");
  if (result.capacityIssue) messages.push("Room capacity is less than class size");
  if (result.labRoomMismatch) messages.push("Lab subject must be assigned to a lab room");
  if (messages.length > 0) {
    throw badRequest(messages.join("; "));
  }
}
