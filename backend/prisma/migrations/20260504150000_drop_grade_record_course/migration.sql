-- Course codes in spreadsheets are not persisted on grade rows; import ignores those columns.
ALTER TABLE "GradeRecord" DROP COLUMN IF EXISTS "course";
