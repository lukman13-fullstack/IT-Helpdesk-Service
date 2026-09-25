const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  try {
    console.log("Clearing existing data...");

    await prisma.user_token.deleteMany({});
    await prisma.log.deleteMany({});
    
    await prisma.user_section.deleteMany({});
    await prisma.section.deleteMany({});
    
    await prisma.user_department.deleteMany({});
    await prisma.user.deleteMany({});

    await prisma.role_permission.deleteMany();
    await prisma.permission.deleteMany();
    await prisma.role.deleteMany();
    await prisma.department.deleteMany();

    console.log("Creating permissions...");
    const permissions = await Promise.all([
      prisma.permission.create({ data: { name: "MANAGE_USERS", description: "Dapat mengelola pengguna" } }),
      prisma.permission.create({ data: { name: "MANAGE_ROLES", description: "Dapat mengelola peran" } }),
      prisma.permission.create({ data: { name: "VIEW_PROFILE", description: "Dapat melihat profil sendiri" } }),
      prisma.permission.create({ data: { name: "MANAGE_DEPARTMENTS", description: "Dapat mengelola departemen" } }),
      prisma.permission.create({ data: { name: "MANAGE_SECTIONS", description: "Dapat mengelola section" } }),
    ]);

    console.log("Creating roles...");
    const superAdminRole = await prisma.role.create({
      data: {
        name: "Super Admin",
        description: "Super Administrator with all access",
      },
    });

    const adminRole = await prisma.role.create({
      data: {
        name: "Admin",
        description: "Administrator System",
      },
    });

    const userRole = await prisma.role.create({
      data: {
        name: "User",
        description: "Standard User",
      },
    });

    console.log("Assigning permissions to roles...");
    for (const permission of permissions) {
      await prisma.role_permission.create({
        data: {
          roleId: adminRole.id,
          permissionId: permission.id,
        },
      });
      await prisma.role_permission.create({
        data: {
          roleId: superAdminRole.id,
          permissionId: permission.id,
        },
      });
    }

    console.log("Creating departments...");
    const deptIT = await prisma.department.create({
      data: {
        name: "IT",
        departmentCode: "IT-01",
        description: "Information Technology",
      },
    });

    console.log("Creating sections...");
    const sectionHelpdesk = await prisma.section.create({
      data: {
        departmentId: deptIT.id,
        name: "Helpdesk",
        sectionCode: "HD-01",
        description: "IT Helpdesk Support",
      },
    });

    console.log("Creating users...");
    const hashedPassword = await bcrypt.hash("password123", 10);

    const superAdminUser = await prisma.user.create({
      data: {
        fullName: "System Super Admin",
        username: "superadmin",
        email: "superadmin@example.com",
        password: hashedPassword,
        roleId: superAdminRole.id,
        position: "Director",
      },
    });

    const adminUser = await prisma.user.create({
      data: {
        fullName: "System Admin",
        username: "admin",
        email: "admin@example.com",
        password: hashedPassword,
        roleId: adminRole.id,
        position: "Manager",
      },
    });

    console.log("Creating ticket categories...");
    await prisma.ticket_category.deleteMany({});
    
    // Parent Categories
    const catSoftware = await prisma.ticket_category.create({ data: { name: "Software", description: "Software related issues" } });
    const catHardware = await prisma.ticket_category.create({ data: { name: "Hardware", description: "Hardware related issues" } });
    const catNetwork = await prisma.ticket_category.create({ data: { name: "Network", description: "Network and connectivity issues" } });
    const catEmail = await prisma.ticket_category.create({ data: { name: "Email", description: "Email and communication issues" } });
    const catOther = await prisma.ticket_category.create({ data: { name: "Other", description: "Other general issues" } });

    // Hardware Sub-categories
    const catPrinter = await prisma.ticket_category.create({ data: { name: "Printer", parentId: catHardware.id, description: "Printer and scanner issues" } });
    const catComputer = await prisma.ticket_category.create({ data: { name: "Computer", parentId: catHardware.id, description: "PC and Laptop issues" } });
    const catMonitor = await prisma.ticket_category.create({ data: { name: "Monitor", parentId: catComputer.id, description: "Monitor and display issues" } });

    console.log("Assigning users to departments and sections...");
    await prisma.user_department.create({
      data: {
        userId: adminUser.id,
        departmentId: deptIT.id,
      },
    });

    await prisma.user_section.create({
      data: {
        userId: adminUser.id,
        sectionId: sectionHelpdesk.id,
      },
    });

    console.log("Seeding finished successfully.");
  } catch (error) {
    console.error("Error during seeding:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
