-- Possible subjects to teach (SubjectFacultyPriority) become per academic year + semester, so editing one
-- term never rewrites past terms. Existing rows are copied to the active academic year (semesters 1 and 2)
-- and the legacy rows without a term are then removed. If no academic year is active, legacy rows are kept
-- untouched (they are ignored by the app until re-entered).
ALTER TABLE "SubjectFacultyPriority" ADD COLUMN "academicYearId" TEXT;
ALTER TABLE "SubjectFacultyPriority" ADD COLUMN "semester" INTEGER;

DROP INDEX "SubjectFacultyPriority_subjectId_facultyId_key";

INSERT INTO "SubjectFacultyPriority" ("id", "subjectId", "facultyId", "priority", "createdAt", "academicYearId", "semester")
SELECT gen_random_uuid()::text, p."subjectId", p."facultyId", p."priority", p."createdAt", ay."id", s."semester"
FROM "SubjectFacultyPriority" p
CROSS JOIN (SELECT "id" FROM "AcademicYear" WHERE "isActive" = true AND "isDeleted" = false) ay
CROSS JOIN (VALUES (1), (2)) AS s("semester")
WHERE p."academicYearId" IS NULL;

DELETE FROM "SubjectFacultyPriority"
WHERE "academicYearId" IS NULL
  AND EXISTS (SELECT 1 FROM "AcademicYear" WHERE "isActive" = true AND "isDeleted" = false);

CREATE UNIQUE INDEX "SubjectFacultyPriority_subjectId_facultyId_academicYearId_semester_key"
  ON "SubjectFacultyPriority"("subjectId", "facultyId", "academicYearId", "semester");
CREATE INDEX "SubjectFacultyPriority_academicYearId_semester_idx" ON "SubjectFacultyPriority"("academicYearId", "semester");
ALTER TABLE "SubjectFacultyPriority" ADD CONSTRAINT "SubjectFacultyPriority_academicYearId_fkey"
  FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;
