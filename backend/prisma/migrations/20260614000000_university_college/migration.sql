-- University > College > Department. Everything that exists today moves under one college (College of Engineering).
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PRESIDENT';

CREATE TABLE "University" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "code" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "University_pkey" PRIMARY KEY ("id"));
CREATE TABLE "College" ("id" TEXT NOT NULL, "universityId" TEXT NOT NULL, "name" TEXT NOT NULL, "code" TEXT, "isDeleted" BOOLEAN NOT NULL DEFAULT false, "deletedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "College_pkey" PRIMARY KEY ("id"));
CREATE INDEX "College_universityId_idx" ON "College"("universityId");
ALTER TABLE "College" ADD CONSTRAINT "College_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "University" ("id", "name", "code", "updatedAt") VALUES ('00000000-0000-0000-0000-0000000000a1', 'University', NULL, CURRENT_TIMESTAMP);
INSERT INTO "College" ("id", "universityId", "name", "code", "updatedAt") VALUES ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'College of Engineering', 'COE', CURRENT_TIMESTAMP);

ALTER TABLE "Department" ADD COLUMN "collegeId" TEXT;
UPDATE "Department" SET "collegeId" = '00000000-0000-0000-0000-0000000000a2';
ALTER TABLE "Department" ALTER COLUMN "collegeId" SET NOT NULL;
CREATE INDEX "Department_collegeId_idx" ON "Department"("collegeId");
ALTER TABLE "Department" ADD CONSTRAINT "Department_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Curriculum" ADD COLUMN "collegeId" TEXT;
UPDATE "Curriculum" SET "collegeId" = '00000000-0000-0000-0000-0000000000a2';
ALTER TABLE "Curriculum" ALTER COLUMN "collegeId" SET NOT NULL;
CREATE INDEX "Curriculum_collegeId_idx" ON "Curriculum"("collegeId");
ALTER TABLE "Curriculum" ADD CONSTRAINT "Curriculum_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Subject" ADD COLUMN "collegeId" TEXT;
UPDATE "Subject" SET "collegeId" = '00000000-0000-0000-0000-0000000000a2';
ALTER TABLE "Subject" ALTER COLUMN "collegeId" SET NOT NULL;
CREATE INDEX "Subject_collegeId_idx" ON "Subject"("collegeId");
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentClass" ADD COLUMN "collegeId" TEXT;
UPDATE "StudentClass" SET "collegeId" = '00000000-0000-0000-0000-0000000000a2';
ALTER TABLE "StudentClass" ALTER COLUMN "collegeId" SET NOT NULL;
CREATE INDEX "StudentClass_collegeId_idx" ON "StudentClass"("collegeId");
ALTER TABLE "StudentClass" ADD CONSTRAINT "StudentClass_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Room" ADD COLUMN "collegeId" TEXT;
UPDATE "Room" SET "collegeId" = '00000000-0000-0000-0000-0000000000a2';
ALTER TABLE "Room" ALTER COLUMN "collegeId" SET NOT NULL;
CREATE INDEX "Room_collegeId_idx" ON "Room"("collegeId");
ALTER TABLE "Room" ADD CONSTRAINT "Room_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FacultyLoad" ADD COLUMN "collegeId" TEXT;
UPDATE "FacultyLoad" SET "collegeId" = '00000000-0000-0000-0000-0000000000a2';
ALTER TABLE "FacultyLoad" ALTER COLUMN "collegeId" SET NOT NULL;
CREATE INDEX "FacultyLoad_collegeId_idx" ON "FacultyLoad"("collegeId");
ALTER TABLE "FacultyLoad" ADD CONSTRAINT "FacultyLoad_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SchedulingRuleSet" ADD COLUMN "collegeId" TEXT;
UPDATE "SchedulingRuleSet" SET "collegeId" = '00000000-0000-0000-0000-0000000000a2';
ALTER TABLE "SchedulingRuleSet" ALTER COLUMN "collegeId" SET NOT NULL;
CREATE INDEX "SchedulingRuleSet_collegeId_idx" ON "SchedulingRuleSet"("collegeId");
ALTER TABLE "SchedulingRuleSet" ADD CONSTRAINT "SchedulingRuleSet_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GeOfferingSet" ADD COLUMN "collegeId" TEXT;
UPDATE "GeOfferingSet" SET "collegeId" = '00000000-0000-0000-0000-0000000000a2';
ALTER TABLE "GeOfferingSet" ALTER COLUMN "collegeId" SET NOT NULL;
CREATE INDEX "GeOfferingSet_collegeId_idx" ON "GeOfferingSet"("collegeId");
ALTER TABLE "GeOfferingSet" ADD CONSTRAINT "GeOfferingSet_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TermLock" ADD COLUMN "collegeId" TEXT;
UPDATE "TermLock" SET "collegeId" = '00000000-0000-0000-0000-0000000000a2';
ALTER TABLE "TermLock" ALTER COLUMN "collegeId" SET NOT NULL;
CREATE INDEX "TermLock_collegeId_idx" ON "TermLock"("collegeId");
ALTER TABLE "TermLock" ADD CONSTRAINT "TermLock_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CrossDepartmentLoadRequest" ADD COLUMN "collegeId" TEXT;
UPDATE "CrossDepartmentLoadRequest" SET "collegeId" = '00000000-0000-0000-0000-0000000000a2';
ALTER TABLE "CrossDepartmentLoadRequest" ALTER COLUMN "collegeId" SET NOT NULL;
CREATE INDEX "CrossDepartmentLoadRequest_collegeId_idx" ON "CrossDepartmentLoadRequest"("collegeId");
ALTER TABLE "CrossDepartmentLoadRequest" ADD CONSTRAINT "CrossDepartmentLoadRequest_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- people: everyone except the system admin belongs to the college
ALTER TABLE "User" ADD COLUMN "collegeId" TEXT;
UPDATE "User" SET "collegeId" = '00000000-0000-0000-0000-0000000000a2' WHERE "role" <> 'ADMIN';
CREATE INDEX "User_collegeId_idx" ON "User"("collegeId");
ALTER TABLE "User" ADD CONSTRAINT "User_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- semester locks and GE sheets are per college
DROP INDEX "TermLock_academicYearId_semester_key";
CREATE UNIQUE INDEX "TermLock_collegeId_academicYearId_semester_key" ON "TermLock"("collegeId", "academicYearId", "semester");
DROP INDEX "GeOfferingSet_academicYearId_semester_key";
CREATE UNIQUE INDEX "GeOfferingSet_collegeId_academicYearId_semester_key" ON "GeOfferingSet"("collegeId", "academicYearId", "semester");

-- audit entries: older ones stay university level (their rows cannot be changed)
ALTER TABLE "AuditLog" ADD COLUMN "collegeId" TEXT;
CREATE INDEX "AuditLog_collegeId_idx" ON "AuditLog"("collegeId");
