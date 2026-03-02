import { prisma } from "../../prisma/client.js";
import { badRequest, notFound } from "../../utils/errors.js";
import type { CreateAcademicYearBody, UpdateAcademicYearBody } from "./academicYearSchemas.js";

/** Ensure only one academic year is active: set all non-deleted to false then optionally set the given id to true. */
async function ensureSingleActive(activateId?: string) {
  await prisma.$transaction([
    prisma.academicYear.updateMany({ where: { isDeleted: false }, data: { isActive: false } }),
    ...(activateId ? [prisma.academicYear.update({ where: { id: activateId }, data: { isActive: true } })] : []),
  ]);
}

export async function listAcademicYears() {
  return prisma.academicYear.findMany({
    where: { isDeleted: false },
    orderBy: { name: "desc" },
  });
}

/** Only active academic years (for schedules/reports – inactive years are hidden). */
export async function listActiveAcademicYears() {
  return prisma.academicYear.findMany({
    where: { isDeleted: false, isActive: true },
    orderBy: { name: "desc" },
  });
}

export async function getAcademicYearById(id: string) {
  const y = await prisma.academicYear.findUnique({ where: { id } });
  if (!y || y.isDeleted) throw notFound("Academic year not found");
  return y;
}

export async function getActiveAcademicYear() {
  return prisma.academicYear.findFirst({ where: { isActive: true, isDeleted: false } });
}

export async function createAcademicYear(body: CreateAcademicYearBody) {
  if (body.isActive) {
    await ensureSingleActive();
  }
  const created = await prisma.academicYear.create({
    data: { name: body.name, isActive: body.isActive ?? false },
  });
  if (body.isActive) {
    await ensureSingleActive(created.id);
  }
  return prisma.academicYear.findUniqueOrThrow({ where: { id: created.id } });
}

export async function updateAcademicYear(id: string, body: UpdateAcademicYearBody) {
  const y = await prisma.academicYear.findUnique({ where: { id } });
  if (!y) throw notFound("Academic year not found");
  if (y.isDeleted) throw badRequest("Cannot update a deleted academic year. Restore it from Trash first.");
  if (body.isActive === true) {
    await ensureSingleActive(id);
  }
  if (body.name !== undefined) {
    await prisma.academicYear.update({ where: { id }, data: { name: body.name } });
  }
  return prisma.academicYear.findUniqueOrThrow({ where: { id } });
}

export async function softDeleteAcademicYear(id: string) {
  const y = await prisma.academicYear.findUnique({ where: { id } });
  if (!y) throw notFound("Academic year not found");
  if (y.isDeleted) throw badRequest("Academic year is already deleted");
  await prisma.academicYear.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  if (y.isActive) {
    await ensureSingleActive();
  }
}

export async function listTrashAcademicYears() {
  return prisma.academicYear.findMany({
    where: { isDeleted: true },
    orderBy: { deletedAt: "desc" },
  });
}

export async function restoreAcademicYear(id: string) {
  const y = await prisma.academicYear.findUnique({ where: { id } });
  if (!y) throw notFound("Academic year not found");
  if (!y.isDeleted) throw badRequest("Academic year is not in trash");
  await prisma.academicYear.update({
    where: { id },
    data: { isDeleted: false, deletedAt: null },
  });
}

export async function permanentDeleteAcademicYear(id: string) {
  const y = await prisma.academicYear.findUnique({ where: { id } });
  if (!y) throw notFound("Academic year not found");
  if (!y.isDeleted) throw badRequest("Only academic years in Trash can be permanently deleted");
  await prisma.academicYear.delete({ where: { id } });
  if (y.isActive) {
    await ensureSingleActive();
  }
}