-- CreateEnum
CREATE TYPE "CrossDepartmentRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- DropForeignKey
ALTER TABLE "FacultyLoad" DROP CONSTRAINT "FacultyLoad_facultyId_fkey";

-- DropForeignKey
ALTER TABLE "FacultyLoad" DROP CONSTRAINT "FacultyLoad_roomId_fkey";

-- AlterTable
ALTER TABLE "FacultyLoad" ADD COLUMN     "facultyDisplayName" TEXT,
ADD COLUMN     "roomDisplayName" TEXT,
ALTER COLUMN "facultyId" DROP NOT NULL,
ALTER COLUMN "roomId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "controlDepartmentId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "maxUnits" INTEGER;

-- CreateTable
CREATE TABLE "RoomTermAvailability" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomTermAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrossDepartmentLoadRequest" (
    "id" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "facultyId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "studentClassId" TEXT NOT NULL,
    "roomId" TEXT,
    "roomDisplayName" TEXT,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "status" "CrossDepartmentRequestStatus" NOT NULL DEFAULT 'PENDING',
    "respondedById" TEXT,
    "respondedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrossDepartmentLoadRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoomTermAvailability_roomId_idx" ON "RoomTermAvailability"("roomId");

-- CreateIndex
CREATE INDEX "RoomTermAvailability_academicYearId_idx" ON "RoomTermAvailability"("academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomTermAvailability_roomId_academicYearId_semester_key" ON "RoomTermAvailability"("roomId", "academicYearId", "semester");

-- CreateIndex
CREATE INDEX "CrossDepartmentLoadRequest_facultyId_idx" ON "CrossDepartmentLoadRequest"("facultyId");

-- CreateIndex
CREATE INDEX "CrossDepartmentLoadRequest_academicYearId_idx" ON "CrossDepartmentLoadRequest"("academicYearId");

-- CreateIndex
CREATE INDEX "CrossDepartmentLoadRequest_status_idx" ON "CrossDepartmentLoadRequest"("status");

-- CreateIndex
CREATE INDEX "Room_controlDepartmentId_idx" ON "Room"("controlDepartmentId");

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_controlDepartmentId_fkey" FOREIGN KEY ("controlDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomTermAvailability" ADD CONSTRAINT "RoomTermAvailability_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomTermAvailability" ADD CONSTRAINT "RoomTermAvailability_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrossDepartmentLoadRequest" ADD CONSTRAINT "CrossDepartmentLoadRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrossDepartmentLoadRequest" ADD CONSTRAINT "CrossDepartmentLoadRequest_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrossDepartmentLoadRequest" ADD CONSTRAINT "CrossDepartmentLoadRequest_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrossDepartmentLoadRequest" ADD CONSTRAINT "CrossDepartmentLoadRequest_studentClassId_fkey" FOREIGN KEY ("studentClassId") REFERENCES "StudentClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrossDepartmentLoadRequest" ADD CONSTRAINT "CrossDepartmentLoadRequest_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrossDepartmentLoadRequest" ADD CONSTRAINT "CrossDepartmentLoadRequest_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrossDepartmentLoadRequest" ADD CONSTRAINT "CrossDepartmentLoadRequest_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacultyLoad" ADD CONSTRAINT "FacultyLoad_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacultyLoad" ADD CONSTRAINT "FacultyLoad_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
