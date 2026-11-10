-- The Google Sheet link a grade subject imports from, saved with the subject instead of only in one browser.
ALTER TABLE "GradeSubject" ADD COLUMN "sheetImportUrl" TEXT;
