-- Room sharing between colleges: a block booked into another college's room, and the requests that get it there.
ALTER TABLE "FacultyLoad" ADD COLUMN "hostCollegeId" TEXT;
CREATE INDEX "FacultyLoad_hostCollegeId_idx" ON "FacultyLoad"("hostCollegeId");

CREATE TABLE "RoomShareRequest" (
    "id" TEXT NOT NULL,
    "guestCollegeId" TEXT NOT NULL,
    "hostCollegeId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_CHAIRMAN',
    "note" TEXT,
    "submittedById" TEXT,
    "submittedByName" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomShareRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoomShareBlock" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "guestCollegeId" TEXT NOT NULL,
    "hostCollegeId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "studentClassId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "facultyId" TEXT,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomShareBlock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoomShareApproval" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "departmentName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "RoomShareApproval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RoomShareRequest_guestCollegeId_status_idx" ON "RoomShareRequest"("guestCollegeId", "status");
CREATE INDEX "RoomShareRequest_hostCollegeId_status_idx" ON "RoomShareRequest"("hostCollegeId", "status");
CREATE INDEX "RoomShareBlock_requestId_idx" ON "RoomShareBlock"("requestId");
CREATE INDEX "RoomShareBlock_guestCollegeId_requestId_idx" ON "RoomShareBlock"("guestCollegeId", "requestId");
CREATE INDEX "RoomShareBlock_roomId_academicYearId_semester_idx" ON "RoomShareBlock"("roomId", "academicYearId", "semester");
CREATE UNIQUE INDEX "RoomShareApproval_requestId_departmentId_key" ON "RoomShareApproval"("requestId", "departmentId");

ALTER TABLE "RoomShareBlock" ADD CONSTRAINT "RoomShareBlock_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "RoomShareRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomShareApproval" ADD CONSTRAINT "RoomShareApproval_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "RoomShareRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
