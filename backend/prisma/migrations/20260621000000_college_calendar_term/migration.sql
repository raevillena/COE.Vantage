-- The "Current Semester" (what is running now) is separate from the "Scheduling Semester" (what the college is scheduling;
-- the existing currentAcademicYearId / currentSemester columns). Faculty-facing pages and grades follow the current one.
ALTER TABLE "College" ADD COLUMN "calendarAcademicYearId" TEXT;
ALTER TABLE "College" ADD COLUMN "calendarSemester" INTEGER;

-- colleges start with both the same, so nothing changes until someone sets them apart
UPDATE "College" SET "calendarAcademicYearId" = "currentAcademicYearId", "calendarSemester" = "currentSemester";

ALTER TABLE "College" ADD CONSTRAINT "College_calendarAcademicYearId_fkey" FOREIGN KEY ("calendarAcademicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;
