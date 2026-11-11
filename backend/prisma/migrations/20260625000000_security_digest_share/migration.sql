-- Email digest flags, login history, schedule share links and list indexes.
ALTER TABLE "User" ADD COLUMN "emailDigest" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Notification" ADD COLUMN "emailedAt" TIMESTAMP(3);
CREATE INDEX "Notification_readAt_emailedAt_createdAt_idx" ON "Notification"("readAt", "emailedAt", "createdAt");

CREATE TABLE "LoginEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "method" TEXT NOT NULL,
    "reason" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LoginEvent_userId_createdAt_idx" ON "LoginEvent"("userId", "createdAt");
CREATE INDEX "LoginEvent_email_createdAt_idx" ON "LoginEvent"("email", "createdAt");
CREATE INDEX "LoginEvent_createdAt_idx" ON "LoginEvent"("createdAt");

CREATE TABLE "ScheduleShareLink" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "ScheduleShareLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ScheduleShareLink_tokenHash_key" ON "ScheduleShareLink"("tokenHash");
CREATE INDEX "ScheduleShareLink_createdById_idx" ON "ScheduleShareLink"("createdById");
CREATE INDEX "ScheduleShareLink_kind_targetId_idx" ON "ScheduleShareLink"("kind", "targetId");

CREATE INDEX "User_collegeId_isDeleted_name_idx" ON "User"("collegeId", "isDeleted", "name");
CREATE INDEX "Room_collegeId_isDeleted_name_idx" ON "Room"("collegeId", "isDeleted", "name");
CREATE INDEX "GradeRecord_subjectId_studentName_idx" ON "GradeRecord"("subjectId", "studentName");
CREATE INDEX "FacultyLoad_academicYearId_semester_collegeId_idx" ON "FacultyLoad"("academicYearId", "semester", "collegeId");
