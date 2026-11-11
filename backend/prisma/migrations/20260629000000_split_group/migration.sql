-- A split class is now a set of numbered groups, so one instructor can teach more than one of them.
ALTER TABLE "FacultyLoad" ADD COLUMN "splitGroup" INTEGER;

-- Existing splits had one group per instructor: number them the same way.
UPDATE "FacultyLoad" fl
SET "splitGroup" = r.rk
FROM (
  SELECT id,
         DENSE_RANK() OVER (
           PARTITION BY "studentClassId", "subjectId", "academicYearId", "semester"
           ORDER BY COALESCE("facultyId"::text, 'name:' || lower(trim(COALESCE("facultyDisplayName", ''))))
         ) AS rk
  FROM "FacultyLoad"
  WHERE "isSplit" = true
) r
WHERE fl.id = r.id;
