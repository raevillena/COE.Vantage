import { prisma } from "../prisma/client.js";
import { runUnscoped, scopeCollegeId } from "./auditContext.js";

/** The name of the college the current request is about (the person's own, or the one the admin is viewing); "All colleges" when none. */
export async function currentCollegeName(): Promise<string> {
  const id = scopeCollegeId();
  if (!id) return "All colleges";
  const college = await runUnscoped(() => prisma.college.findFirst({ where: { id }, select: { name: true } }));
  return college?.name ?? "College";
}
