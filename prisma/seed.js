const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  try {
    // Clear existing data (order matters due to foreign key constraints)
    console.log("Clearing existing data...");

    // Delete tables that reference documents first
    // COMMENTED OUT: Consolidating print approvals into digital_approval
    // await prisma.print_approval.deleteMany({});

    await prisma.print_request.deleteMany({});
    await prisma.notification.deleteMany({});
    await prisma.document_history.deleteMany({});
    await prisma.digital_approval.deleteMany({});
    await prisma.document_reference_link.deleteMany({});
    await prisma.document_reference.deleteMany({});
    await prisma.work_instruction_template.deleteMany({});
    await prisma.document.deleteMany({});

    // Delete tables that reference hierarchy
    // (digital_approval already deleted above)
    await prisma.hierarchy.deleteMany({});

    // Delete tables that reference users and departments
    await prisma.magic_token.deleteMany({});
    await prisma.category_hierarchy.deleteMany({});
    await prisma.log.deleteMany({});
    await prisma.user_department.deleteMany({});
    await prisma.user.deleteMany({});

    // Delete roles and permissions
    await prisma.role_permission.deleteMany();
    await prisma.permission.deleteMany();
    await prisma.role.deleteMany();

    // Finally delete departments
    await prisma.department.deleteMany();

    // Create permissions
    console.log("Creating permissions...");
    const permissions = await Promise.all([
      prisma.permission.create({
        data: { name: "MANAGE_USERS", description: "Dapat mengelola pengguna" },
      }),
      prisma.permission.create({
        data: { name: "MANAGE_ROLES", description: "Dapat mengelola peran" },
      }),
      prisma.permission.create({
        data: {
          name: "VIEW_PROFILE",
          description: "Dapat melihat profil sendiri",
        },
      }),
      prisma.permission.create({
        data: {
          name: "MANAGE_DEPARTMENTS",
          description: "Dapat mengelola departemen",
        },
      }),
      prisma.permission.create({
        data: {
          name: "UPLOAD_DOCUMENT",
          description: "Dapat mengupload dokumen baru",
        },
      }),
      prisma.permission.create({
        data: { name: "VIEW_DOCUMENTS", description: "Dapat melihat dokumen" },
      }),
      prisma.permission.create({
        data: {
          name: "UPDATE_DOCUMENT",
          description: "Dapat mengupdate metadata dokumen",
        },
      }),
      prisma.permission.create({
        data: {
          name: "DELETE_DOCUMENT",
          description: "Dapat menghapus dokumen",
        },
      }),
      prisma.permission.create({
        data: {
          name: "REVISE_DOCUMENT",
          description: "Dapat merevisi dokumen",
        },
      }),
      prisma.permission.create({
        data: {
          name: "APPROVE_DOCUMENT",
          description: "Dapat menyetujui dokumen dalam workflow",
        },
      }),
      prisma.permission.create({
        data: {
          name: "DOWNLOAD_DOCUMENT",
          description: "Dapat mendownload file dokumen",
        },
      }),
      prisma.permission.create({
        data: {
          name: "VIEW_ALL_DOCUMENTS",
          description: "Dapat melihat semua dokumen",
        },
      }),
      prisma.permission.create({
        data: {
          name: "VIEW_OBSOLETE_DOCUMENTS",
          description: "Dapat melihat dokumen obsolete berdasarkan departement",
        },
      }),
      prisma.permission.create({
        data: {
          name: "DOWNLOAD_OBSOLETE_DOCUMENTS",
          description: "Dapat mendownload dokumen obsolete",
        },
      }),
      prisma.permission.create({
        data: {
          name: "BYPASS_ALL_APPROVAL",
          description:
            "Dapat melewati semua proses approval untuk dokumen dan print request",
        },
      }),
      prisma.permission.create({
        data: {
          name: "PRINT_LIST_DOCUMENT",
          description: "Dapat mencetak daftar induk dokumen",
        },
      }),
      prisma.permission.create({
        data: {
          name: "MANAGE_REFERENCES",
          description: "Dapat mengelola referensi dokumen (ISO, Halal, dll)",
        },
      }),
      prisma.permission.create({
        data: {
          name: "EXPORT_EXCEL",
          description: "Dapat mengekspor daftar induk dokumen ke excel",
        },
      }),
      prisma.permission.create({
        data: {
          name: "MIGRATE_DOCUMENT",
          description: "Dapat melakukan migrasi dokumen lama",
        },
      }),
      prisma.permission.create({
        data: {
          name: "VIEW_RECORDS",
          description: "Dapat melihat menu Records",
        },
      }),
    ]);

    // Create roles
    console.log("Creating roles...");
    const superAdminRole = await prisma.role.create({
      data: {
        name: "SUPER_ADMIN",
        description: "Super Administrator dengan akses penuh",
        permissions: {
          create: permissions.map((permission) => ({
            permission: { connect: { id: permission.id } },
          })),
        },
      },
    });

    const adminRole = await prisma.role.create({
      data: {
        name: "ADMIN",
        description: "Administrator dengan akses terbatas",
        permissions: {
          create: permissions
            .filter((p) => p.name !== "BYPASS_ALL_APPROVAL")
            .map((permission) => ({
              permission: { connect: { id: permission.id } },
            })),
        },
      },
    });

    const leadAuditorRole = await prisma.role.create({
      data: {
        name: "LEAD_AUDITOR",
        description: "Lead Auditor",
        permissions: {
          create: permissions
            .filter((p) =>
              [
                "VIEW_DOCUMENTS",
                "APPROVE_DOCUMENT",
                "DOWNLOAD_DOCUMENT",
                "VIEW_PROFILE",
                "VIEW_RECORDS",
              ].includes(p.name)
            )
            .map((permission) => ({
              permission: { connect: { id: permission.id } },
            })),
        },
      },
    });

    const userRole = await prisma.role.create({
      data: {
        name: "USER",
        description: "Pengguna biasa",
        permissions: {
          create: permissions
            .filter((p) =>
              [
                "VIEW_PROFILE",
                "VIEW_DOCUMENTS",
                "UPDATE_DOCUMENT",
                "UPLOAD_DOCUMENT",
                "DOWNLOAD_DOCUMENT",
                "REVISE_DOCUMENT",
              ].includes(p.name)
            )
            .map((permission) => ({
              permission: { connect: { id: permission.id } },
            })),
        },
      },
    });

    const japanRole = await prisma.role.create({
      data: {
        name: "JAPAN",
        description: "Japanese Management dengan akses penuh",
        permissions: {
          create: permissions.map((permission) => ({
            permission: { connect: { id: permission.id } },
          })),
        },
      },
    });

    // Create departments
    console.log("Creating departments...");
    const departments = {};

    const deptData = [
      { code: "TM", name: "Top Management", description: "Top Management" },
      {
        code: "MR",
        name: "Management Representative",
        description: "Management Representative",
      },
      { code: "QA", name: "QA", description: "Quality Assurance" },
      {
        code: "MKT-GRV",
        name: "Marketing Gravure",
        description: "Marketing Gravure",
      },
      {
        code: "MKT-PC",
        name: "Marketing PC & SC & CNV",
        description: "Marketing PC & SC & CNV",
      },
      {
        code: "MKT-OFS",
        name: "Marketing OFS & CC",
        description: "Marketing OFS & CC",
      },
      {
        code: "ADM-MKT",
        name: "Admin Marketing",
        description: "Admin Marketing",
      },
      { code: "GA", name: "General Affair", description: "General Affair" },
      {
        code: "HRD",
        name: "Human Research Development",
        description: "Human Research Development",
      },
      { code: "PUR", name: "Purchasing", description: "Purchasing" },
      {
        code: "FIN",
        name: "Finance & Accounting",
        description: "Finance & Accounting",
      },
      {
        code: "ME",
        name: "Mechanical & Electrical",
        description: "Mechanical & Electrical",
      },
      {
        code: "PPIC-P2",
        name: "PPIC Production 2",
        description: "PPIC Production 2",
      },
      {
        code: "GRV-PROD",
        name: "Gravure Production",
        description: "Gravure Production",
      },
      { code: "GRV-QC", name: "Gravure QC", description: "Gravure QC" },
      {
        code: "GRV-TECH",
        name: "Gravure Technical",
        description: "Gravure Technical",
      },
      {
        code: "OFS-SS",
        name: "Offset Silkscreen",
        description: "Offset Silkscreen",
      },
      {
        code: "LOG-WH",
        name: "Logistic & Warehouse",
        description: "Logistic & Warehouse",
      },
      {
        code: "PC-PPIC",
        name: "Plastic Colorant PPIC",
        description: "Plastic Colorant PPIC",
      },
      {
        code: "PC-PROD",
        name: "Plastic Colorant Production & ME",
        description: "Plastic Colorant Production & ME",
      },
      {
        code: "PC-PROD-2",
        name: "Plastic Colorant Production",
        description: "Plastic Colorant Production",
      },
      {
        code: "PC-ME",
        name: "Plastic Colorant ME",
        description: "Plastic Colorant ME",
      },
      {
        code: "PC-QC",
        name: "Plastic Colorant QC",
        description: "Plastic Colorant QC",
      },
      {
        code: "PC-RND",
        name: "Plastic Colorant RND",
        description: "Plastic Colorant RND",
      },
      {
        code: "CC-TECH",
        name: "Can Coating Technical & Prod",
        description: "Can Coating Technical & Prod",
      },
      {
        code: "CC-PROD",
        name: "Can Coating Production",
        description: "Can Coating Production",
      },
      {
        code: "CC-TECH-2",
        name: "Can Coating Technical",
        description: "Can Coating Technical",
      },
      {
        code: "IT",
        name: "Information & Technology",
        description: "Information & Technology",
      },
      {
        code: "HSE",
        name: "Health Safety & Environment",
        description: "Health Safety & Environment",
      },
    ];

    for (const dept of deptData) {
      departments[dept.code] = await prisma.department.create({
        data: {
          name: dept.name,
          description: dept.description,
          departmentCode: dept.code,
          status: "draft",
        },
      });
    }

    // Create users with default password
    console.log("Creating users...");
    const defaultPassword = await bcrypt.hash("123321", 10);

    const users = {};

    // Top Management
    users.timamura = await prisma.user.create({
      data: {
        username: "timamura",
        fullName: "T. Imamura",
        email: "timamura@toyoink.com",
        password: defaultPassword,
        roleId: japanRole.id,
        position: "President Director",
        departments: { create: [{ departmentId: departments["TM"].id }] },
      },
    });

    users.yniwa = await prisma.user.create({
      data: {
        username: "yniwa",
        fullName: "Y. Niwa",
        email: "admin_toyoink@toyoink.co.id",
        password: defaultPassword,
        roleId: japanRole.id,
        position: "Director",
        departments: { create: [{ departmentId: departments["TM"].id }] },
      },
    });

    users.ttokura = await prisma.user.create({
      data: {
        username: "ttokura",
        fullName: "T. Tokura",
        email: "ttokura@toyoink.com",
        password: defaultPassword,
        roleId: japanRole.id,
        position: "Director",
        departments: { create: [{ departmentId: departments["TM"].id }] },
      },
    });

    users.ttakahata = await prisma.user.create({
      data: {
        username: "ttakahata",
        fullName: "T. Takahata",
        email: "ttakahata@toyoink.com",
        password: defaultPassword,
        roleId: adminRole.id,
        position: "General Manager",
        departments: { create: [{ departmentId: departments["TM"].id }] },
      },
    });

    users.skato = await prisma.user.create({
      data: {
        username: "skato",
        fullName: "S. Kato",
        email: "skato@toyoink.com",
        password: defaultPassword,
        roleId: adminRole.id,
        position: "General Manager",
        departments: { create: [{ departmentId: departments["TM"].id }] },
      },
    });

    // Management Representative
    users.rsalan = await prisma.user.create({
      data: {
        username: "rsalan",
        fullName: "R. S. Alan P",
        email: "rsalan@toyoink.com",
        password: defaultPassword,
        roleId: adminRole.id,
        position: "Manager",
        departments: { create: [{ departmentId: departments["MR"].id }] },
      },
    });

    users.adriana = await prisma.user.create({
      data: {
        username: "adriana",
        fullName: "Adriana Halal",
        email: "lukmanpirmansah@toyoink.co.id",
        password: defaultPassword,
        roleId: adminRole.id,
        position: "Supervisor",
        departments: { create: [{ departmentId: departments["MR"].id }] },
      },
    });

    users.fikri = await prisma.user.create({
      data: {
        username: "fikri",
        fullName: "Fikri Lahzi",
        email: "fikri@toyoink.com",
        password: defaultPassword,
        roleId: adminRole.id,
        position: "Staff",
        departments: { create: [{ departmentId: departments["MR"].id }] },
      },
    });

    // QA
    users.admin = await prisma.user.create({
      data: {
        username: "admin",
        fullName: "Admin",
        email: "admin@toyoink.com",
        password: defaultPassword,
        roleId: adminRole.id,
        position: "Admin",
        departments: { create: [{ departmentId: departments["QA"].id }] },
      },
    });
    users.qaleader = await prisma.user.create({
      data: {
        username: "qaleader",
        fullName: "QA Leader",
        email: "qaleader@toyoink.com",
        password: defaultPassword,
        roleId: superAdminRole.id,
        position: "Leader",
        departments: { create: [{ departmentId: departments["QA"].id }] },
      },
    });
    users.qastaff = await prisma.user.create({
      data: {
        username: "qastaff",
        fullName: "QA Staff",
        email: "qastaff@toyoink.com",
        password: defaultPassword,
        roleId: userRole.id,
        position: "Staff",
        departments: { create: [{ departmentId: departments["QA"].id }] },
      },
    });
    users.fifi = await prisma.user.create({
      data: {
        username: "fifi",
        fullName: "fifi",
        email: "fifi@toyoink.com",
        password: defaultPassword,
        roleId: userRole.id,
        position: "Supervisor",
        departments: { create: [{ departmentId: departments["QA"].id }] },
      },
    });

    // Marketing
    users.agus = await prisma.user.create({
      data: {
        username: "agus",
        fullName: "Agus",
        email: "agus@toyoink.com",
        password: defaultPassword,
        roleId: adminRole.id,
        position: "Manager",
        departments: { create: [{ departmentId: departments["MKT-GRV"].id }] },
      },
    });

    users.chelly = await prisma.user.create({
      data: {
        username: "chelly",
        fullName: "Chelly",
        email: "chelly@toyoink.com",
        password: defaultPassword,
        roleId: adminRole.id,
        position: "Manager",
        departments: { create: [{ departmentId: departments["MKT-PC"].id }] },
      },
    });

    users.saiful = await prisma.user.create({
      data: {
        username: "saiful",
        fullName: "Saiful",
        email: "saiful@toyoink.com",
        password: defaultPassword,
        roleId: adminRole.id,
        position: "Manager",
        departments: { create: [{ departmentId: departments["MKT-OFS"].id }] },
      },
    });

    users.liagustini = await prisma.user.create({
      data: {
        username: "liagustini",
        fullName: "Liagustini",
        email: "liagustini@toyoink.com",
        password: defaultPassword,
        roleId: adminRole.id,
        position: "Manager",
        departments: { create: [{ departmentId: departments["ADM-MKT"].id }] },
      },
    });

    // General Affair
    users.heni = await prisma.user.create({
      data: {
        username: "heni",
        fullName: "Heni Marlina",
        email: "heni@toyoink.com",
        password: defaultPassword,
        roleId: adminRole.id,
        position: "Manager",
        departments: { create: [{ departmentId: departments["GA"].id }] },
      },
    });

    // HRD
    users.dwi = await prisma.user.create({
      data: {
        username: "dwi",
        fullName: "Dwi S",
        email: "dwi@toyoink.com",
        password: defaultPassword,
        roleId: adminRole.id,
        position: "Manager",
        departments: { create: [{ departmentId: departments["HRD"].id }] },
      },
    });

    // Purchasing
    users.nunuk = await prisma.user.create({
      data: {
        username: "nunuk",
        fullName: "Nunuk N",
        email: "nunuk@toyoink.com",
        password: defaultPassword,
        roleId: adminRole.id,
        position: "Manager",
        departments: { create: [{ departmentId: departments["PUR"].id }] },
      },
    });

    // Finance
    users.afni = await prisma.user.create({
      data: {
        username: "afni",
        fullName: "Afni",
        email: "afni@toyoink.com",
        password: defaultPassword,
        roleId: adminRole.id,
        position: "Manager",
        departments: { create: [{ departmentId: departments["FIN"].id }] },
      },
    });

    // ME
    users.sudarmono = await prisma.user.create({
      data: {
        username: "sudarmono",
        fullName: "Sudarmono",
        email: "sudarmono@toyoink.com",
        password: defaultPassword,
        roleId: adminRole.id,
        position: "Manager",
        departments: { create: [{ departmentId: departments["ME"].id }] },
      },
    });

    // PPIC Production 2
    users.yopi = await prisma.user.create({
      data: {
        username: "yopi",
        fullName: "Yopi",
        email: "yopi@toyoink.com",
        password: defaultPassword,
        roleId: adminRole.id,
        position: "Manager",
        departments: { create: [{ departmentId: departments["PPIC-P2"].id }] },
      },
    });

    users.nuri = await prisma.user.create({
      data: {
        username: "nuri",
        fullName: "Nuri",
        email: "nuri@toyoink.com",
        password: defaultPassword,
        roleId: userRole.id,
        position: "Staff",
        departments: { create: [{ departmentId: departments["PPIC-P2"].id }] },
      },
    });

    // Gravure Production
    users.prijo = await prisma.user.create({
      data: {
        username: "prijo",
        fullName: "Prijo",
        email: "prijo@toyoink.com",
        password: defaultPassword,
        roleId: adminRole.id,
        position: "Manager",
        departments: { create: [{ departmentId: departments["GRV-PROD"].id }] },
      },
    });

    users.elbinson = await prisma.user.create({
      data: {
        username: "elbinson",
        fullName: "Elbinson",
        email: "elbinson@toyoink.com",
        password: defaultPassword,
        roleId: userRole.id,
        position: "Staff",
        departments: { create: [{ departmentId: departments["GRV-PROD"].id }] },
      },
    });

    // Gravure QC
    users.jarnuji = await prisma.user.create({
      data: {
        username: "jarnuji",
        fullName: "Jarnuji",
        email: "jarnuji@toyoink.com",
        password: defaultPassword,
        roleId: userRole.id,
        position: "Staff",
        departments: { create: [{ departmentId: departments["GRV-QC"].id }] },
      },
    });

    // Gravure Technical
    users.safrizal = await prisma.user.create({
      data: {
        username: "safrizal",
        fullName: "Safrizal",
        email: "safrizal@toyoink.com",
        password: defaultPassword,
        roleId: adminRole.id,
        position: "Manager",
        departments: { create: [{ departmentId: departments["GRV-TECH"].id }] },
      },
    });

    users.hanin = await prisma.user.create({
      data: {
        username: "hanin",
        fullName: "Hanin",
        email: "hanin@toyoink.com",
        password: defaultPassword,
        roleId: userRole.id,
        position: "Staff",
        departments: { create: [{ departmentId: departments["GRV-TECH"].id }] },
      },
    });

    // Offset Silkscreen
    users.sugeng = await prisma.user.create({
      data: {
        username: "sugeng",
        fullName: "Sugeng",
        email: "sugeng@toyoink.com",
        password: defaultPassword,
        roleId: adminRole.id,
        position: "Manager",
        departments: { create: [{ departmentId: departments["OFS-SS"].id }] },
      },
    });

    // Logistic & Warehouse
    users.akhmad = await prisma.user.create({
      data: {
        username: "akhmad",
        fullName: "Akhmad S",
        email: "akhmad@toyoink.com",
        password: defaultPassword,
        roleId: adminRole.id,
        position: "Manager",
        departments: { create: [{ departmentId: departments["LOG-WH"].id }] },
      },
    });

    // Plastic Colorant
    users.siska = await prisma.user.create({
      data: {
        username: "siska",
        fullName: "Siska",
        email: "siska@toyoink.com",
        password: defaultPassword,
        roleId: userRole.id,
        position: "Staff",
        departments: { create: [{ departmentId: departments["PC-PPIC"].id }] },
      },
    });

    users.maman = await prisma.user.create({
      data: {
        username: "maman",
        fullName: "Maman",
        email: "maman@toyoink.com",
        password: defaultPassword,
        roleId: adminRole.id,
        position: "Manager",
        departments: { create: [{ departmentId: departments["PC-PROD"].id }] },
      },
    });

    users.herman = await prisma.user.create({
      data: {
        username: "herman",
        fullName: "Herman",
        email: "herman@toyoink.com",
        password: defaultPassword,
        roleId: userRole.id,
        position: "Staff",
        departments: {
          create: [{ departmentId: departments["PC-PROD-2"].id }],
        },
      },
    });

    users.atsan = await prisma.user.create({
      data: {
        username: "atsan",
        fullName: "Atsan",
        email: "atsan@toyoink.com",
        password: defaultPassword,
        roleId: userRole.id,
        position: "Staff",
        departments: { create: [{ departmentId: departments["PC-ME"].id }] },
      },
    });

    users.daniel = await prisma.user.create({
      data: {
        username: "daniel",
        fullName: "Daniel",
        email: "daniel@toyoink.com",
        password: defaultPassword,
        roleId: adminRole.id,
        position: "Manager",
        departments: { create: [{ departmentId: departments["PC-QC"].id }] },
      },
    });

    users.suyanto = await prisma.user.create({
      data: {
        username: "suyanto",
        fullName: "Suyanto",
        email: "suyanto@toyoink.com",
        password: defaultPassword,
        roleId: adminRole.id,
        position: "Manager",
        departments: { create: [{ departmentId: departments["PC-RND"].id }] },
      },
    });

    // Can Coating
    users.tari = await prisma.user.create({
      data: {
        username: "tari",
        fullName: "Tari",
        email: "tari@toyoink.com",
        password: defaultPassword,
        roleId: adminRole.id,
        position: "Manager",
        departments: { create: [{ departmentId: departments["CC-TECH"].id }] },
      },
    });

    users.abdulr = await prisma.user.create({
      data: {
        username: "abdulr",
        fullName: "Abdul R",
        email: "abdulr@toyoink.com",
        password: defaultPassword,
        roleId: userRole.id,
        position: "Staff",
        departments: { create: [{ departmentId: departments["CC-PROD"].id }] },
      },
    });

    users.fauzia = await prisma.user.create({
      data: {
        username: "fauzia",
        fullName: "Fauzia M",
        email: "fauzia@toyoink.com",
        password: defaultPassword,
        roleId: userRole.id,
        position: "Staff",
        departments: {
          create: [{ departmentId: departments["CC-TECH-2"].id }],
        },
      },
    });

    // IT
    users.lukman = await prisma.user.create({
      data: {
        username: "lukman",
        fullName: "lukman",
        email: "it@toyoink.co.id",
        password: defaultPassword,
        roleId: adminRole.id,
        position: "Manager",
        departments: { create: [{ departmentId: departments["IT"].id }] },
      },
    });

    users.riski = await prisma.user.create({
      data: {
        username: "riski",
        fullName: "Riski Magang",
        email: "riski@toyoink.com",
        password: defaultPassword,
        roleId: userRole.id,
        position: "Intern",
        departments: { create: [{ departmentId: departments["IT"].id }] },
      },
    });

    users.ali = await prisma.user.create({
      data: {
        username: "ali",
        fullName: "ali",
        email: "ali@toyoink.com",
        password: defaultPassword,
        roleId: userRole.id,
        position: "Staff",
        departments: { create: [{ departmentId: departments["IT"].id }] },
      },
    });

    // HSE
    users.aulia = await prisma.user.create({
      data: {
        username: "aulia",
        fullName: "Aulia",
        email: "aulia@toyoink.com",
        password: defaultPassword,
        roleId: userRole.id,
        position: "Staff",
        departments: { create: [{ departmentId: departments["HSE"].id }] },
      },
    });

    // Create hierarchies for departments
    console.log("Creating hierarchies...");

    // Top Management - 5 levels
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["TM"].id,
        userId: users.timamura.id,
        level: 1,
      },
    });
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["TM"].id,
        userId: users.yniwa.id,
        level: 2,
      },
    });
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["TM"].id,
        userId: users.ttokura.id,
        level: 3,
      },
    });
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["TM"].id,
        userId: users.ttakahata.id,
        level: 4,
      },
    });
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["TM"].id,
        userId: users.skato.id,
        level: 5,
      },
    });

    // Management Representative
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["MR"].id,
        userId: users.rsalan.id,
        level: 1,
      },
    });
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["MR"].id,
        userId: users.adriana.id,
        level: 2,
      },
    });
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["MR"].id,
        userId: users.fikri.id,
        level: 3,
      },
    });

    // QA
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["QA"].id,
        userId: users.qaleader.id,
        level: 1,
      },
    });
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["QA"].id,
        userId: users.qastaff.id,
        level: 2,
      },
    });
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["QA"].id,
        userId: users.fifi.id,
        level: 3,
      },
    });

    // Marketing departments
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["MKT-GRV"].id,
        userId: users.agus.id,
        level: 1,
      },
    });
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["MKT-PC"].id,
        userId: users.chelly.id,
        level: 1,
      },
    });
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["MKT-OFS"].id,
        userId: users.saiful.id,
        level: 1,
      },
    });
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["ADM-MKT"].id,
        userId: users.liagustini.id,
        level: 1,
      },
    });

    // Other departments
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["GA"].id,
        userId: users.heni.id,
        level: 1,
      },
    });
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["HRD"].id,
        userId: users.dwi.id,
        level: 1,
      },
    });
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["PUR"].id,
        userId: users.nunuk.id,
        level: 1,
      },
    });
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["FIN"].id,
        userId: users.afni.id,
        level: 1,
      },
    });
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["ME"].id,
        userId: users.sudarmono.id,
        level: 1,
      },
    });

    // PPIC Production 2
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["PPIC-P2"].id,
        userId: users.yopi.id,
        level: 1,
      },
    });
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["PPIC-P2"].id,
        userId: users.nuri.id,
        level: 2,
      },
    });

    // Gravure departments
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["GRV-PROD"].id,
        userId: users.prijo.id,
        level: 1,
      },
    });
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["GRV-PROD"].id,
        userId: users.elbinson.id,
        level: 2,
      },
    });
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["GRV-QC"].id,
        userId: users.jarnuji.id,
        level: 1,
      },
    });
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["GRV-TECH"].id,
        userId: users.safrizal.id,
        level: 1,
      },
    });
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["GRV-TECH"].id,
        userId: users.hanin.id,
        level: 2,
      },
    });

    // Other production departments
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["OFS-SS"].id,
        userId: users.sugeng.id,
        level: 1,
      },
    });
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["LOG-WH"].id,
        userId: users.akhmad.id,
        level: 1,
      },
    });

    // Plastic Colorant departments
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["PC-PPIC"].id,
        userId: users.siska.id,
        level: 1,
      },
    });
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["PC-PROD"].id,
        userId: users.maman.id,
        level: 1,
      },
    });
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["PC-PROD-2"].id,
        userId: users.herman.id,
        level: 1,
      },
    });
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["PC-ME"].id,
        userId: users.atsan.id,
        level: 1,
      },
    });
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["PC-QC"].id,
        userId: users.daniel.id,
        level: 1,
      },
    });
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["PC-RND"].id,
        userId: users.suyanto.id,
        level: 1,
      },
    });

    // Can Coating departments
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["CC-TECH"].id,
        userId: users.tari.id,
        level: 1,
      },
    });
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["CC-PROD"].id,
        userId: users.abdulr.id,
        level: 1,
      },
    });
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["CC-TECH-2"].id,
        userId: users.fauzia.id,
        level: 1,
      },
    });

    // IT & HSE
    await prisma.hierarchy.create({
      data: {
        departmentId: departments["IT"].id,
        userId: users.lukman.id,
        level: 1,
      },
    });

    await prisma.hierarchy.create({
      data: {
        departmentId: departments["IT"].id,
        userId: users.ali.id,
        level: 2,
      },
    });

    await prisma.hierarchy.create({
      data: {
        departmentId: departments["HSE"].id,
        userId: users.aulia.id,
        level: 1,
      },
    });

    // Update department status to active (since they now have hierarchies and codes)
    console.log("Updating department status...");
    await prisma.department.updateMany({
      data: { status: "active" },
    });

    console.log("\n✅ Seed berhasil dijalankan!");
    console.log("\n📊 Summary:");
    console.log(`- ${Object.keys(departments).length} departments created`);
    console.log(`- ${Object.keys(users).length} users created`);
    console.log(`- All users have default password: 123321`);
    console.log("\n🔑 Sample login credentials:");
    console.log("- timamura / 123321 (Super Admin)");
    console.log("- yniwa / 123321 (Admin)");
    console.log("- qaleader / 123321 (Lead Auditor)");
    console.log("- qastaff / 123321 (User)");
  } catch (error) {
    console.error("❌ Error saat menjalankan seed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
