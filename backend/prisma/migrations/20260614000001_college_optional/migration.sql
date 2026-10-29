-- The college of a record is filled in by the app (from the signed-in person or the record it belongs to), so the column stays optional in the database.
ALTER TABLE "Department" ALTER COLUMN "collegeId" DROP NOT NULL;
ALTER TABLE "Curriculum" ALTER COLUMN "collegeId" DROP NOT NULL;
ALTER TABLE "Subject" ALTER COLUMN "collegeId" DROP NOT NULL;
ALTER TABLE "StudentClass" ALTER COLUMN "collegeId" DROP NOT NULL;
ALTER TABLE "Room" ALTER COLUMN "collegeId" DROP NOT NULL;
ALTER TABLE "FacultyLoad" ALTER COLUMN "collegeId" DROP NOT NULL;
ALTER TABLE "SchedulingRuleSet" ALTER COLUMN "collegeId" DROP NOT NULL;
ALTER TABLE "GeOfferingSet" ALTER COLUMN "collegeId" DROP NOT NULL;
ALTER TABLE "TermLock" ALTER COLUMN "collegeId" DROP NOT NULL;
ALTER TABLE "CrossDepartmentLoadRequest" ALTER COLUMN "collegeId" DROP NOT NULL;
