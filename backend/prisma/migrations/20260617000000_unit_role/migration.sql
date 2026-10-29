-- A viewer role for the university administration. The admin chooses which colleges and which areas of them a viewer sees.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'UNIT';
ALTER TABLE "User" ADD COLUMN "unitColleges" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD COLUMN "unitAreas" TEXT[] DEFAULT ARRAY[]::TEXT[];
