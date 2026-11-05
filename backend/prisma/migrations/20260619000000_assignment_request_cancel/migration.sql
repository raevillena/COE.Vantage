-- A chairman can take back an assignment request that is still waiting.
ALTER TYPE "CrossDepartmentRequestStatus" ADD VALUE 'CANCELLED';
