-- AlterTable
ALTER TABLE "AcademicYear" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Curriculum" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "StudentClass" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "AcademicYear_isDeleted_idx" ON "AcademicYear"("isDeleted");

-- CreateIndex
CREATE INDEX "Curriculum_isDeleted_idx" ON "Curriculum"("isDeleted");

-- CreateIndex
CREATE INDEX "Department_isDeleted_idx" ON "Department"("isDeleted");

-- CreateIndex
CREATE INDEX "StudentClass_isDeleted_idx" ON "StudentClass"("isDeleted");

-- CreateIndex
CREATE INDEX "Subject_isDeleted_idx" ON "Subject"("isDeleted");

-- CreateIndex
CREATE INDEX "User_isDeleted_idx" ON "User"("isDeleted");
