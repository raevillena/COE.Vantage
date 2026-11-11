-- College deadlines with email reminders.
CREATE TABLE "CollegeDeadline" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "audienceRoles" "Role"[] DEFAULT ARRAY[]::"Role"[],
    "reminderDays" INTEGER[] DEFAULT ARRAY[7, 3, 1]::INTEGER[],
    "reminderHour" INTEGER NOT NULL DEFAULT 8,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CollegeDeadline_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CollegeDeadline_collegeId_dueAt_idx" ON "CollegeDeadline"("collegeId", "dueAt");

CREATE TABLE "CollegeDeadlineReminder" (
    "id" TEXT NOT NULL,
    "deadlineId" TEXT NOT NULL,
    "daysBefore" INTEGER NOT NULL,
    "firedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipients" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CollegeDeadlineReminder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CollegeDeadlineReminder_deadlineId_daysBefore_key" ON "CollegeDeadlineReminder"("deadlineId", "daysBefore");
ALTER TABLE "CollegeDeadlineReminder" ADD CONSTRAINT "CollegeDeadlineReminder_deadlineId_fkey" FOREIGN KEY ("deadlineId") REFERENCES "CollegeDeadline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
