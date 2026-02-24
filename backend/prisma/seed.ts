import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

  const TEST_PASSWORD = "Test123!";

async function main() {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);

  // Clean dummy data so re-run does not duplicate (keep users/departments/academic years we upsert)
  await prisma.facultyLoad.deleteMany({});
  await prisma.studentClass.deleteMany({});
  await prisma.subject.deleteMany({});
  await prisma.curriculum.deleteMany({});
  await prisma.room.deleteMany({});

  // 1. Departments
  const deptCoe = await prisma.department.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "College of Engineering",
      code: "COE",
    },
  });

  const deptCe = await prisma.department.upsert({
    where: { id: "00000000-0000-0000-0000-000000000002" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000002",
      name: "Civil Engineering",
      code: "CE",
    },
  });

  const deptEce = await prisma.department.upsert({
    where: { id: "00000000-0000-0000-0000-000000000003" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000003",
      name: "Electronics and Communications Engineering",
      code: "ECE",
    },
  });

  const departments = [deptCoe, deptCe, deptEce];

  // 2. Users (1 ADMIN, 1 DEAN, 1 CHAIRMAN, 4 FACULTY, 1 OFFICER)
  const usersData = [
    { email: "admin@coe.vantage", role: "ADMIN" as const, name: "System Administrator", departmentId: deptCoe.id },
    { email: "dean@coe.vantage", role: "DEAN" as const, name: "Dr. Jane Dean", departmentId: deptCoe.id },
    { email: "chairman@coe.vantage", role: "CHAIRMAN" as const, name: "Prof. John Chairman", departmentId: deptCe.id },
    { email: "faculty1@coe.vantage", role: "FACULTY" as const, name: "Dr. Maria Santos", departmentId: deptCe.id },
    { email: "faculty2@coe.vantage", role: "FACULTY" as const, name: "Engr. Carlos Reyes", departmentId: deptCe.id },
    { email: "faculty3@coe.vantage", role: "FACULTY" as const, name: "Prof. Ana Lopez", departmentId: deptEce.id },
    { email: "faculty4@coe.vantage", role: "FACULTY" as const, name: "Dr. Pedro Cruz", departmentId: deptEce.id },
    { email: "officer@coe.vantage", role: "OFFICER" as const, name: "Office Staff", departmentId: deptCoe.id },
  ];

  const users: { id: string; role: string }[] = [];
  for (const u of usersData) {
    const created = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        passwordHash,
        role: u.role,
        name: u.name,
        departmentId: u.departmentId,
      },
    });
    users.push(created);
  }

  const adminUser = users.find((u) => u.role === "ADMIN")!;
  const chairmanUser = users.find((u) => u.role === "CHAIRMAN")!;
  const facultyUsers = users.filter((u) => u.role === "FACULTY");

  // 3. Academic years (one active)
  const ay2425 = await prisma.academicYear.upsert({
    where: { id: "00000000-0000-0000-0000-000000000010" },
    update: { isActive: false },
    create: {
      id: "00000000-0000-0000-0000-000000000010",
      name: "2024-2025",
      isActive: false,
    },
  });

  const ay2526 = await prisma.academicYear.upsert({
    where: { id: "00000000-0000-0000-0000-000000000011" },
    update: { isActive: true },
    create: {
      id: "00000000-0000-0000-0000-000000000011",
      name: "2025-2026",
      isActive: true,
    },
  });

  await prisma.academicYear.updateMany({
    where: { id: { not: ay2526.id } },
    data: { isActive: false },
  });

  const activeYear = ay2526;

  // 4. Rooms (per department; some lab; capacity 30–50)
  const roomsData = [
    { name: "COE-101", capacity: 40, isLab: false, departmentId: deptCoe.id },
    { name: "COE-102", capacity: 35, isLab: false, departmentId: deptCoe.id },
    { name: "COE-Lab1", capacity: 25, isLab: true, departmentId: deptCoe.id },
    { name: "CE-201", capacity: 45, isLab: false, departmentId: deptCe.id },
    { name: "CE-202", capacity: 30, isLab: false, departmentId: deptCe.id },
    { name: "CE-Lab1", capacity: 30, isLab: true, departmentId: deptCe.id },
    { name: "ECE-301", capacity: 40, isLab: false, departmentId: deptEce.id },
    { name: "ECE-Lab1", capacity: 25, isLab: true, departmentId: deptEce.id },
  ];

  const rooms: { id: string; name: string; capacity: number; isLab: boolean; departmentId: string }[] = [];
  for (const r of roomsData) {
    const created = await prisma.room.create({
      data: {
        ...r,
        hasComputer: r.isLab,
        hasAC: true,
      },
    });
    rooms.push(created);
  }

  const roomCoe101 = rooms.find((r) => r.name === "COE-101")!;
  const roomCe201 = rooms.find((r) => r.name === "CE-201")!;
  const roomCe202 = rooms.find((r) => r.name === "CE-202")!;
  const roomCeLab = rooms.find((r) => r.name === "CE-Lab1")!;
  const roomEce301 = rooms.find((r) => r.name === "ECE-301")!;
  const roomEceLab = rooms.find((r) => r.name === "ECE-Lab1")!;

  // 5. Curricula (per department)
  const currBsce = await prisma.curriculum.create({
    data: { name: "Bachelor of Science in Civil Engineering", code: "BSCE", departmentId: deptCe.id },
  });
  const currBsee = await prisma.curriculum.create({
    data: { name: "Bachelor of Science in Electronics Engineering", code: "BSEE", departmentId: deptEce.id },
  });

  // 6. Subjects — BSCE curriculum (broad spread; some lab)
  const bsceSubjectsData = [
    { code: "MATH101", name: "Engineering Mathematics I", units: 3, isLab: false },
    { code: "MATH102", name: "Engineering Mathematics II", units: 3, isLab: false },
    { code: "MATH203", name: "Differential Equations", units: 3, isLab: false },
    { code: "MATH204", name: "Probability and Statistics", units: 3, isLab: false },
    { code: "PHY101", name: "Physics for Engineers", units: 4, isLab: false },
    { code: "PHY102", name: "Physics for Engineers II", units: 3, isLab: false },
    { code: "PHY101L", name: "Physics Lab", units: 1, isLab: true },
    { code: "CHEM101", name: "General Chemistry", units: 3, isLab: false },
    { code: "CHEM101L", name: "Chemistry Lab", units: 1, isLab: true },
    { code: "ENG101", name: "Engineering Drawing", units: 2, isLab: false },
    { code: "ENG102", name: "Computer-Aided Drafting", units: 2, isLab: true },
    { code: "CE101", name: "Introduction to Civil Engineering", units: 2, isLab: false },
    { code: "CE201", name: "Surveying", units: 3, isLab: false },
    { code: "CE201L", name: "Surveying Lab", units: 1, isLab: true },
    { code: "CE202", name: "Mechanics of Deformable Bodies", units: 3, isLab: false },
    { code: "CE203", name: "Engineering Geology", units: 3, isLab: false },
    { code: "CE301", name: "Structural Theory", units: 3, isLab: false },
    { code: "CE302", name: "Structural Analysis", units: 3, isLab: false },
    { code: "CE303", name: "Hydraulics", units: 3, isLab: false },
    { code: "CE303L", name: "Hydraulics Lab", units: 1, isLab: true },
    { code: "CE304", name: "Geotechnical Engineering", units: 3, isLab: false },
    { code: "CE305", name: "Reinforced Concrete Design", units: 3, isLab: false },
    { code: "CE306", name: "Steel Design", units: 3, isLab: false },
    { code: "CE401", name: "Highway Engineering", units: 3, isLab: false },
    { code: "CE402", name: "Water Resources Engineering", units: 3, isLab: false },
    { code: "CE403", name: "Construction Management", units: 3, isLab: false },
    { code: "CE404", name: "Civil Engineering Design Project", units: 2, isLab: false },
    { code: "CE405", name: "CE Laws and Ethics", units: 2, isLab: false },
  ];
  const bsceSubjects: { id: string; code: string }[] = [];
  for (const s of bsceSubjectsData) {
    const created = await prisma.subject.create({
      data: { ...s, curriculumId: currBsce.id, departmentId: deptCe.id },
    });
    bsceSubjects.push(created);
  }
  const subjMath = bsceSubjects.find((s) => s.code === "MATH101")!;
  const subjPhysics = bsceSubjects.find((s) => s.code === "PHY101")!;
  const subjChemLab = bsceSubjects.find((s) => s.code === "CHEM101L")!;
  const subjSurvey = bsceSubjects.find((s) => s.code === "CE201")!;

  // 6b. Subjects — BSEE curriculum
  const bseeSubjectsData = [
    { code: "MATH101", name: "Engineering Mathematics I", units: 3, isLab: false },
    { code: "MATH102", name: "Engineering Mathematics II", units: 3, isLab: false },
    { code: "MATH203", name: "Differential Equations", units: 3, isLab: false },
    { code: "PHY101", name: "Physics for Engineers", units: 4, isLab: false },
    { code: "PHY101L", name: "Physics Lab", units: 1, isLab: true },
    { code: "ECE101", name: "Circuit Analysis", units: 3, isLab: false },
    { code: "ECE101L", name: "Circuit Analysis Lab", units: 1, isLab: true },
    { code: "ECE102", name: "Electronics Engineering Drawings", units: 2, isLab: true },
    { code: "ECE201", name: "Electronic Devices and Circuits", units: 3, isLab: false },
    { code: "ECE201L", name: "Electronic Devices and Circuits Lab", units: 1, isLab: true },
    { code: "ECE202", name: "Signals and Systems", units: 3, isLab: false },
    { code: "ECE203", name: "Digital Logic Circuits", units: 3, isLab: false },
    { code: "ECE203L", name: "Digital Logic Circuits Lab", units: 1, isLab: true },
    { code: "ECE301", name: "Communications Engineering I", units: 3, isLab: false },
    { code: "ECE302", name: "Communications Engineering II", units: 3, isLab: false },
    { code: "ECE303", name: "Electromagnetic Fields", units: 3, isLab: false },
    { code: "ECE304", name: "Microprocessors", units: 3, isLab: false },
    { code: "ECE304L", name: "Microprocessors Lab", units: 1, isLab: true },
    { code: "ECE305", name: "Control Systems", units: 3, isLab: false },
    { code: "CPE101", name: "Computer Programming", units: 3, isLab: true },
    { code: "CPE201", name: "Data Structures and Algorithms", units: 3, isLab: true },
    { code: "ECE401", name: "Electronics Engineering Design", units: 2, isLab: false },
    { code: "ECE402", name: "Data Communications", units: 3, isLab: false },
    { code: "ECE403", name: "ECE Laws and Ethics", units: 2, isLab: false },
  ];
  const bseeSubjects: { id: string; code: string }[] = [];
  for (const s of bseeSubjectsData) {
    const created = await prisma.subject.create({
      data: { ...s, curriculumId: currBsee.id, departmentId: deptEce.id },
    });
    bseeSubjects.push(created);
  }
  const subjCircuits = bseeSubjects.find((s) => s.code === "ECE101")!;
  const subjCircuitsLab = bseeSubjects.find((s) => s.code === "ECE101L")!;

  // 7. Student classes (studentCount <= room capacity)
  const classBsce3a = await prisma.studentClass.create({
    data: { name: "BSCE-3A", yearLevel: 3, curriculumId: currBsce.id, studentCount: 35 },
  });
  const classBsce3b = await prisma.studentClass.create({
    data: { name: "BSCE-3B", yearLevel: 3, curriculumId: currBsce.id, studentCount: 30 },
  });
  const classBsee4a = await prisma.studentClass.create({
    data: { name: "BSEE-4A", yearLevel: 4, curriculumId: currBsee.id, studentCount: 25 },
  });

  // 8. Faculty loads (no overlaps; lab subjects in lab rooms; capacity ok)
  // Faculty 1: Mon 08:00-09:00 (CE-201), Mon 10:00-11:00 (CE-202)
  // Faculty 2: Mon 08:00-09:00 (CE-202) different class, Tue 08:00-09:00 (CE-201)
  // Faculty 3: Tue 08:00-09:00 (ECE-301), Tue 10:00-11:00 (ECE-Lab1) lab
  const loadsData = [
    { facultyId: facultyUsers[0].id, subjectId: subjMath.id, studentClassId: classBsce3a.id, roomId: roomCe201.id, dayOfWeek: 1, startTime: "08:00", endTime: "09:00", semester: 1, academicYearId: activeYear.id },
    { facultyId: facultyUsers[0].id, subjectId: subjPhysics.id, studentClassId: classBsce3a.id, roomId: roomCe201.id, dayOfWeek: 1, startTime: "10:00", endTime: "11:00", semester: 1, academicYearId: activeYear.id },
    { facultyId: facultyUsers[1].id, subjectId: subjSurvey.id, studentClassId: classBsce3b.id, roomId: roomCe202.id, dayOfWeek: 1, startTime: "08:00", endTime: "09:00", semester: 1, academicYearId: activeYear.id },
    { facultyId: facultyUsers[1].id, subjectId: subjMath.id, studentClassId: classBsce3b.id, roomId: roomCe201.id, dayOfWeek: 2, startTime: "08:00", endTime: "09:00", semester: 1, academicYearId: activeYear.id },
    { facultyId: facultyUsers[2].id, subjectId: subjCircuits.id, studentClassId: classBsee4a.id, roomId: roomEce301.id, dayOfWeek: 2, startTime: "08:00", endTime: "09:00", semester: 1, academicYearId: activeYear.id },
    { facultyId: facultyUsers[2].id, subjectId: subjCircuitsLab.id, studentClassId: classBsee4a.id, roomId: roomEceLab.id, dayOfWeek: 2, startTime: "10:00", endTime: "11:30", semester: 1, academicYearId: activeYear.id },
    { facultyId: facultyUsers[0].id, subjectId: subjChemLab.id, studentClassId: classBsce3a.id, roomId: roomCeLab.id, dayOfWeek: 3, startTime: "08:00", endTime: "09:30", semester: 1, academicYearId: activeYear.id },
    { facultyId: facultyUsers[3].id, subjectId: subjCircuits.id, studentClassId: classBsee4a.id, roomId: roomEce301.id, dayOfWeek: 3, startTime: "14:00", endTime: "15:00", semester: 1, academicYearId: activeYear.id },
    { facultyId: facultyUsers[1].id, subjectId: subjPhysics.id, studentClassId: classBsce3b.id, roomId: roomCe202.id, dayOfWeek: 4, startTime: "08:00", endTime: "09:00", semester: 1, academicYearId: activeYear.id },
    { facultyId: facultyUsers[2].id, subjectId: subjCircuits.id, studentClassId: classBsee4a.id, roomId: roomEce301.id, dayOfWeek: 5, startTime: "10:00", endTime: "11:00", semester: 1, academicYearId: activeYear.id },
  ];

  for (const load of loadsData) {
    await prisma.facultyLoad.create({ data: load });
  }

  console.log("Seed completed.");
  console.log(`  Departments: ${departments.length}`);
  console.log(`  Users: ${users.length} (ADMIN, DEAN, CHAIRMAN, ${facultyUsers.length} FACULTY, OFFICER)`);
  console.log(`  Academic years: 2 (active: ${activeYear.name})`);
  console.log(`  Rooms: ${rooms.length}`);
  const totalSubjects = bsceSubjects.length + bseeSubjects.length;
  console.log(`  Curricula: 2 | Subjects: ${totalSubjects} (BSCE: ${bsceSubjects.length}, BSEE: ${bseeSubjects.length}) | Student classes: 3 | Faculty loads: ${loadsData.length}`);
  console.log(`\nTest password for all users: ${TEST_PASSWORD}`);
  console.log("Example logins: admin@coe.vantage, dean@coe.vantage, chairman@coe.vantage, faculty1@coe.vantage, officer@coe.vantage");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
