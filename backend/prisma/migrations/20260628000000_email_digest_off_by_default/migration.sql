ALTER TABLE "User" ALTER COLUMN "emailDigest" SET DEFAULT false;
UPDATE "User" SET "emailDigest" = false;
