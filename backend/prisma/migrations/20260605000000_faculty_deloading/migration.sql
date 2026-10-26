-- Per-term deloading: items that are deducted from a person's maximum units.
CREATE TABLE "FacultyDeloading" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "units" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacultyDeloading_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FacultyDeloading_userId_academicYearId_semester_idx" ON "FacultyDeloading"("userId", "academicYearId", "semester");
CREATE INDEX "FacultyDeloading_academicYearId_semester_idx" ON "FacultyDeloading"("academicYearId", "semester");

ALTER TABLE "FacultyDeloading" ADD CONSTRAINT "FacultyDeloading_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FacultyDeloading" ADD CONSTRAINT "FacultyDeloading_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;
