-- Blocks of a subject whose class is split between different instructors are labelled "split".
ALTER TABLE "FacultyLoad" ADD COLUMN "isSplit" BOOLEAN NOT NULL DEFAULT false;
