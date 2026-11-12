-- New subjects start hidden from the public grade page; subjects that already exist keep showing.
ALTER TABLE "GradeSubject" ALTER COLUMN "publicViewEnabled" SET DEFAULT false;
