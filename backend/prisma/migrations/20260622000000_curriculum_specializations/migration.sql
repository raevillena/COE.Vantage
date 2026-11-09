-- Specializations (tracks) inside a curriculum. A subject with no specialization is common; tagged subjects belong to
-- one or more specializations. Student classes get an optional specialization (not used by the screens yet).
CREATE TABLE "CurriculumSpecialization" (
    "id" TEXT NOT NULL,
    "curriculumId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CurriculumSpecialization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubjectSpecialization" (
    "subjectId" TEXT NOT NULL,
    "specializationId" TEXT NOT NULL,
    CONSTRAINT "SubjectSpecialization_pkey" PRIMARY KEY ("subjectId","specializationId")
);

ALTER TABLE "StudentClass" ADD COLUMN "specializationId" TEXT;

CREATE UNIQUE INDEX "CurriculumSpecialization_curriculumId_name_key" ON "CurriculumSpecialization"("curriculumId", "name");
CREATE INDEX "CurriculumSpecialization_curriculumId_idx" ON "CurriculumSpecialization"("curriculumId");
CREATE INDEX "SubjectSpecialization_specializationId_idx" ON "SubjectSpecialization"("specializationId");
CREATE INDEX "StudentClass_specializationId_idx" ON "StudentClass"("specializationId");

ALTER TABLE "CurriculumSpecialization" ADD CONSTRAINT "CurriculumSpecialization_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "Curriculum"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubjectSpecialization" ADD CONSTRAINT "SubjectSpecialization_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubjectSpecialization" ADD CONSTRAINT "SubjectSpecialization_specializationId_fkey" FOREIGN KEY ("specializationId") REFERENCES "CurriculumSpecialization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentClass" ADD CONSTRAINT "StudentClass_specializationId_fkey" FOREIGN KEY ("specializationId") REFERENCES "CurriculumSpecialization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
