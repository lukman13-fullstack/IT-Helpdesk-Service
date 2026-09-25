const prisma = require("../../utils/prisma");
const { logCreate } = require("../../utils/logger");

const createDepartmentHandler = async (req, res) => {
  try {
    const { name, description, departmentCode } = req.body;

    if (!name) {
      return res.status(400).json({
        status: "error",
        message: "Nama department wajib diisi",
        data: null,
      });
    }

    const whereClause = {
      isDeleted: false,
      OR: [{ name }],
    };

    if (departmentCode) {
      whereClause.OR.push({ departmentCode });
    }

    const existingDepartment = await prisma.department.findFirst({
      where: whereClause,
    });

    if (existingDepartment) {
      let message = "Nama department sudah digunakan";
      if (
        departmentCode &&
        existingDepartment.departmentCode === departmentCode
      ) {
        message = "Department code sudah digunakan";
      }
      return res.status(400).json({
        status: "error",
        message: message,
        data: null,
      });
    }

    const status = "active";

    const department = await prisma.department.create({
      data: {
        name,
        description,
        departmentCode,
        status,
      },
    });

    await logCreate(
      "departments",
      req.user.id,
      department.id,
      {
        name,
        description,
        departmentCode,
        status,
      },
      `Department baru dibuat: ${name} (${status})`
    );

    res.status(201).json({
      status: "success",
      message: "Department berhasil dibuat",
      data: department,
    });
  } catch (error) {
    console.error("Create department error:", error);
    res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan saat membuat department",
      data: null,
    });
  }
};

module.exports = createDepartmentHandler;
