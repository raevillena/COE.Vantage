-- A locked semester takes no scheduling changes until the admin, dean or college secretary unlocks it.
CREATE TABLE "TermLock" (
    "id" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "lockedByName" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TermLock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TermLock_academicYearId_semester_key" ON "TermLock"("academicYearId", "semester");

ALTER TABLE "TermLock" ADD CONSTRAINT "TermLock_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;
