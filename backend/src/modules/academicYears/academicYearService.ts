import { prisma } from "../../prisma/client.js";
import { notFound } from "../../utils/errors.js";
import type { CreateAcademicYearBody, UpdateAcademicYearBody } from "./academicYearSchemas.js";

/** Ensure only one academic year is active: set all to false then optionally set the given id to true. */
async function ensureSingleActive(activateId?: string) {
  await prisma.$transaction([
    prisma.academicYear.updateMany({ data: { isActive: false } }),
    ...(activateId ? [prisma.academicYear.update({ where: { id: activateId }, data: { isActive: true } })] : []),
  ]);
}

export async function listAcademicYears() {
  return prisma.academicYear.findMany({ orderBy: { name: "desc" } });
}

export async function getAcademicYearById(id: string) {
  const y = await prisma.academicYear.findUnique({ where: { id } });
  if (!y) throw notFound("Academic year not found");
  return y;
}

export async function getActiveAcademicYear() {
  return prisma.academicYear.findFirst({ where: { isActive: true } });
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
  if (body.isActive === true) {
    await ensureSingleActive(id);
  }
  if (body.name !== undefined) {
    await prisma.academicYear.update({ where: { id }, data: { name: body.name } });
  }
  return prisma.academicYear.findUniqueOrThrow({ where: { id } });
}

export async function deleteAcademicYear(id: string) {
  const y = await prisma.academicYear.findUnique({ where: { id } });
  if (!y) throw notFound("Academic year not found");
  await prisma.academicYear.delete({ where: { id } });
  if (y.isActive) {
    await ensureSingleActive();
  }
}