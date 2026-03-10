-- CreateTable
CREATE TABLE "SchedulingRuleSet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL,
    "departmentId" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchedulingRuleSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulingRuleSetAssignment" (
    "id" TEXT NOT NULL,
    "academicYearId" TEXT,
    "studentClassId" TEXT,
    "ruleSetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchedulingRuleSetAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchedulingRuleSet_departmentId_idx" ON "SchedulingRuleSet"("departmentId");

-- CreateIndex
CREATE INDEX "SchedulingRuleSet_isSystem_idx" ON "SchedulingRuleSet"("isSystem");

-- CreateIndex
CREATE INDEX "SchedulingRuleSetAssignment_ruleSetId_idx" ON "SchedulingRuleSetAssignment"("ruleSetId");

-- CreateIndex
CREATE INDEX "SchedulingRuleSetAssignment_academicYearId_idx" ON "SchedulingRuleSetAssignment"("academicYearId");

-- CreateIndex
CREATE INDEX "SchedulingRuleSetAssignment_studentClassId_idx" ON "SchedulingRuleSetAssignment"("studentClassId");

-- CreateIndex
CREATE UNIQUE INDEX "SchedulingRuleSetAssignment_academicYearId_studentClassId_key" ON "SchedulingRuleSetAssignment"("academicYearId", "studentClassId");

-- AddForeignKey
ALTER TABLE "SchedulingRuleSet" ADD CONSTRAINT "SchedulingRuleSet_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulingRuleSetAssignment" ADD CONSTRAINT "SchedulingRuleSetAssignment_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulingRuleSetAssignment" ADD CONSTRAINT "SchedulingRuleSetAssignment_studentClassId_fkey" FOREIGN KEY ("studentClassId") REFERENCES "StudentClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulingRuleSetAssignment" ADD CONSTRAINT "SchedulingRuleSetAssignment_ruleSetId_fkey" FOREIGN KEY ("ruleSetId") REFERENCES "SchedulingRuleSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
