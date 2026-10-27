-- The semester filters open on while this academic year is the active one (1 = 1st, 2 = 2nd, 3 = Mid Year).
ALTER TABLE "AcademicYear" ADD COLUMN "currentSemester" INTEGER NOT NULL DEFAULT 1;
