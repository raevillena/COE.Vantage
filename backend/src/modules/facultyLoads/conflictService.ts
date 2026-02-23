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

export interface ConflictResult {
  facultyConflict: boolean;
  roomConflict: boolean;
  studentConflict: boolean;
  capacityIssue: boolean;
  labRoomMismatch: boolean;
}

/** Run all conflict checks for a proposed faculty load (create or update). Pass tx when inside a transaction. */
export async function checkConflicts(
  payload: PreviewFacultyLoadBody,
  tx?: Prisma.TransactionClient
): Promise<ConflictResult> {
  const { facultyId, subjectId, studentClassId, roomId, dayOfWeek, startTime, endTime, semester, academicYearId, excludeLoadId } = payload;
  const db = tx ?? prisma;

  const [subject, room, studentClass, facultyLoadsForFaculty, facultyLoadsForRoom, facultyLoadsForClass] = await Promise.all([
    db.subject.findUniqueOrThrow({ where: { id: subjectId } }),
    db.room.findUniqueOrThrow({ where: { id: roomId } }),
    db.studentClass.findUniqueOrThrow({ where: { id: studentClassId } }),
    db.facultyLoad.findMany({
      where: {
        facultyId,
        academicYearId,
        semester,
        dayOfWeek,
        ...(excludeLoadId ? { id: { not: excludeLoadId } } : {}),
      },
    }),
    db.facultyLoad.findMany({
      where: {
        roomId,
        academicYearId,
        semester,
        dayOfWeek,
        ...(excludeLoadId ? { id: { not: excludeLoadId } } : {}),
      },
    }),
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

  const facultyConflict = facultyLoadsForFaculty.some((l) =>
    timeOverlaps(l.startTime, l.endTime, startTime, endTime)
  );
  const roomConflict = facultyLoadsForRoom.some((l) =>
    timeOverlaps(l.startTime, l.endTime, startTime, endTime)
  );
  const studentConflict = facultyLoadsForClass.some((l) =>
    timeOverlaps(l.startTime, l.endTime, startTime, endTime)
  );
  const capacityIssue = room.capacity < studentClass.studentCount;
  const labRoomMismatch = subject.isLab && !room.isLab;

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
