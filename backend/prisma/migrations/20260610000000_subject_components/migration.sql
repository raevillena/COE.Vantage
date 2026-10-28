-- A subject has lecture units and laboratory units. Existing subjects keep their units in one component:
-- laboratory subjects become all laboratory units, the rest all lecture units.
ALTER TABLE "Subject" ADD COLUMN "lecUnits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Subject" ADD COLUMN "labUnits" INTEGER NOT NULL DEFAULT 0;
UPDATE "Subject" SET "labUnits" = "units", "lecUnits" = 0 WHERE "isLab" = true;
UPDATE "Subject" SET "lecUnits" = "units", "labUnits" = 0 WHERE "isLab" = false;
