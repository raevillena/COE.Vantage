import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  // Default admin password - change in production
  const passwordHash = await bcrypt.hash("Admin123!", 12);

  const dept = await prisma.department.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "College of Engineering",
      code: "COE",
    },
  });

  await prisma.user.upsert({
    where: { email: "admin@coe.vantage" },
    update: {},
    create: {
      email: "admin@coe.vantage",
      passwordHash,
      role: "ADMIN",
      name: "System Administrator",
      departmentId: dept.id,
    },
  });

  await prisma.academicYear.upsert({
    where: { id: "00000000-0000-0000-0000-000000000002" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000002",
      name: "2025-2026",
      isActive: true,
    },
  });

  console.log("Seed completed: ADMIN user (admin@coe.vantage), COE department, 2025-2026 academic year.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
