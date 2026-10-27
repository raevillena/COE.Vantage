-- College-wide GE course offering sheet per term, uploaded by the college secretary.
CREATE TABLE "GeOfferingSet" (
    "id" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "rows" JSONB NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "sourceName" TEXT,
    "uploadedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeOfferingSet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GeOfferingSet_academicYearId_semester_key" ON "GeOfferingSet"("academicYearId", "semester");

ALTER TABLE "GeOfferingSet" ADD CONSTRAINT "GeOfferingSet_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;
