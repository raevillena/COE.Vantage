-- A grade subject can belong to a term (academic year + semester), so the public grade lookup can filter by it and open on the latest.
ALTER TABLE "GradeSubject" ADD COLUMN "academicYearId" TEXT;
ALTER TABLE "GradeSubject" ADD COLUMN "semester" INTEGER;
CREATE INDEX "GradeSubject_academicYearId_semester_idx" ON "GradeSubject"("academicYearId", "semester");
ALTER TABLE "GradeSubject" ADD CONSTRAINT "GradeSubject_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;
