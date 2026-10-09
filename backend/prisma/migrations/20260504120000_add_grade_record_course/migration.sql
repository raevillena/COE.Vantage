-- Optional per-row course/class label (CSV import + manual edit).
ALTER TABLE "GradeRecord" ADD COLUMN IF NOT EXISTS "course" TEXT;
