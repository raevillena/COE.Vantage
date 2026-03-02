-- CreateTable
CREATE TABLE "SubjectFacultyPriority" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "facultyId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubjectFacultyPriority_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubjectFacultyPriority_subjectId_idx" ON "SubjectFacultyPriority"("subjectId");

-- CreateIndex
CREATE INDEX "SubjectFacultyPriority_facultyId_idx" ON "SubjectFacultyPriority"("facultyId");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectFacultyPriority_subjectId_facultyId_key" ON "SubjectFacultyPriority"("subjectId", "facultyId");

-- AddForeignKey
ALTER TABLE "SubjectFacultyPriority" ADD CONSTRAINT "SubjectFacultyPriority_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectFacultyPriority" ADD CONSTRAINT "SubjectFacultyPriority_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
