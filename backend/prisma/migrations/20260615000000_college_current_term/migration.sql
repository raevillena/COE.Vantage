-- Each college chooses its own current term (or none, if it has not started). Academic years stay shared.
ALTER TABLE "College" ADD COLUMN "currentAcademicYearId" TEXT;
ALTER TABLE "College" ADD COLUMN "currentSemester" INTEGER;

-- the colleges that exist start on what was the university's current term
UPDATE "College" SET "currentAcademicYearId" = y."id", "currentSemester" = y."currentSemester"
FROM "AcademicYear" y WHERE y."isActive" = true AND y."isDeleted" = false;

ALTER TABLE "College" ADD CONSTRAINT "College_currentAcademicYearId_fkey" FOREIGN KEY ("currentAcademicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;
