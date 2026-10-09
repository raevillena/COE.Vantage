CREATE TABLE IF NOT EXISTS "GradeSubject" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "ownerId" TEXT NOT NULL,
  "departmentId" TEXT,
  "gradingSystem" JSONB,
  "studentComputeEnabled" BOOLEAN NOT NULL DEFAULT false,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GradeSubject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "GradeSubjectViewer" (
  "id" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "canEdit" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GradeSubjectViewer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "GradeRecord" (
  "id" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "studentName" TEXT NOT NULL,
  "studentNumber" TEXT NOT NULL,
  "email" TEXT,
  "code" TEXT NOT NULL,
  "grades" JSONB NOT NULL,
  "maxScores" JSONB,
  "computedGrade" JSONB,
  "emailSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GradeRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GradeSubjectViewer_subjectId_userId_key"
ON "GradeSubjectViewer"("subjectId", "userId");

CREATE INDEX IF NOT EXISTS "GradeSubject_ownerId_isDeleted_idx"
ON "GradeSubject"("ownerId", "isDeleted");

CREATE INDEX IF NOT EXISTS "GradeSubject_departmentId_idx"
ON "GradeSubject"("departmentId");

CREATE INDEX IF NOT EXISTS "GradeSubjectViewer_userId_idx"
ON "GradeSubjectViewer"("userId");

CREATE INDEX IF NOT EXISTS "GradeRecord_subjectId_idx"
ON "GradeRecord"("subjectId");

CREATE INDEX IF NOT EXISTS "GradeRecord_studentNumber_code_idx"
ON "GradeRecord"("studentNumber", "code");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'GradeSubject_ownerId_fkey'
  ) THEN
    ALTER TABLE "GradeSubject"
    ADD CONSTRAINT "GradeSubject_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'GradeSubject_departmentId_fkey'
  ) THEN
    ALTER TABLE "GradeSubject"
    ADD CONSTRAINT "GradeSubject_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'GradeSubjectViewer_subjectId_fkey'
  ) THEN
    ALTER TABLE "GradeSubjectViewer"
    ADD CONSTRAINT "GradeSubjectViewer_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "GradeSubject"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'GradeSubjectViewer_userId_fkey'
  ) THEN
    ALTER TABLE "GradeSubjectViewer"
    ADD CONSTRAINT "GradeSubjectViewer_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'GradeRecord_subjectId_fkey'
  ) THEN
    ALTER TABLE "GradeRecord"
    ADD CONSTRAINT "GradeRecord_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "GradeSubject"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
