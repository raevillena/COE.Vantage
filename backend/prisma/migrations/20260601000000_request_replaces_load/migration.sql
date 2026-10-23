-- Edit-time faculty changes across departments replace the original load once approved.
ALTER TABLE "CrossDepartmentLoadRequest" ADD COLUMN "replacesLoadId" TEXT;
