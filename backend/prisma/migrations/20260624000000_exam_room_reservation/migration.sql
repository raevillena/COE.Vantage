-- Exam room reservation: exam rounds per college and term (opened by the college secretary), faculty room blocks
-- (first plotted, first served) and chairman requests to free a block.
CREATE TYPE "ExamKind" AS ENUM ('MIDTERM', 'FINAL');
CREATE TYPE "ExamRemovalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

CREATE TABLE "ExamPeriod" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT,
    "academicYearId" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "kind" "ExamKind" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT false,
    "openedByName" TEXT,
    "openedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExamPeriod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExamReservation" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT,
    "academicYearId" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "kind" "ExamKind" NOT NULL,
    "roomId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "studentClassId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExamReservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExamRemovalRequest" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT,
    "reservationId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" "ExamRemovalStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExamRemovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExamPeriod_collegeId_academicYearId_semester_kind_key" ON "ExamPeriod"("collegeId", "academicYearId", "semester", "kind");
CREATE INDEX "ExamPeriod_collegeId_idx" ON "ExamPeriod"("collegeId");
CREATE INDEX "ExamReservation_roomId_date_idx" ON "ExamReservation"("roomId", "date");
CREATE INDEX "ExamReservation_studentClassId_date_idx" ON "ExamReservation"("studentClassId", "date");
CREATE INDEX "ExamReservation_ownerId_idx" ON "ExamReservation"("ownerId");
CREATE INDEX "ExamReservation_academicYearId_semester_kind_idx" ON "ExamReservation"("academicYearId", "semester", "kind");
CREATE INDEX "ExamReservation_collegeId_idx" ON "ExamReservation"("collegeId");
CREATE INDEX "ExamRemovalRequest_reservationId_status_idx" ON "ExamRemovalRequest"("reservationId", "status");
CREATE INDEX "ExamRemovalRequest_requestedById_idx" ON "ExamRemovalRequest"("requestedById");
CREATE INDEX "ExamRemovalRequest_collegeId_idx" ON "ExamRemovalRequest"("collegeId");

ALTER TABLE "ExamPeriod" ADD CONSTRAINT "ExamPeriod_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamPeriod" ADD CONSTRAINT "ExamPeriod_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExamReservation" ADD CONSTRAINT "ExamReservation_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamReservation" ADD CONSTRAINT "ExamReservation_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamReservation" ADD CONSTRAINT "ExamReservation_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamReservation" ADD CONSTRAINT "ExamReservation_studentClassId_fkey" FOREIGN KEY ("studentClassId") REFERENCES "StudentClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamReservation" ADD CONSTRAINT "ExamReservation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamReservation" ADD CONSTRAINT "ExamReservation_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExamRemovalRequest" ADD CONSTRAINT "ExamRemovalRequest_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "ExamReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamRemovalRequest" ADD CONSTRAINT "ExamRemovalRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamRemovalRequest" ADD CONSTRAINT "ExamRemovalRequest_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
