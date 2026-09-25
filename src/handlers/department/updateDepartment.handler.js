const prisma = require("../../utils/prisma");
const { logUpdate } = require("../../utils/logger");

const updateDepartmentHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, departmentCode } = req.body;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        status: "error",
        message: "ID department tidak valid",
        data: null,
      });
    }

    if (!name) {
      return res.status(400).json({
        status: "error",
        message: "Nama department wajib diisi",
        data: null,
      });
    }

    const existingDepartment = await prisma.department.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingDepartment || existingDepartment.isDeleted) {
      return res.status(404).json({
        status: "error",
        message: "Department tidak ditemukan",
        data: null,
      });
    }

    const whereClause = {
      isDeleted: false,
      NOT: { id: parseInt(id) },
      OR: [{ name }],
    };

    if (departmentCode) {
      whereClause.OR.push({ departmentCode });
    }

    const duplicate = await prisma.department.findFirst({
      where: whereClause,
    });

    if (duplicate) {
      let message = "Nama department sudah digunakan";
      if (departmentCode && duplicate.departmentCode === departmentCode) {
        message = "Department code sudah digunakan";
      }
      return res.status(400).json({
        status: "error",
        message: message,
        data: null,
      });
    }

    const status = "active";

    const department = await prisma.department.update({
      where: { id: parseInt(id) },
      data: {
        name,
        description,
        departmentCode,
        status,
      },
    });

    await logUpdate(
      "departments",
      req.user.id,
      parseInt(id),
      {
        name: existingDepartment.name,
        description: existingDepartment.description,
        departmentCode: existingDepartment.departmentCode,
        status: existingDepartment.status,
      },
      {
        name,
        description,
        departmentCode,
        status,
      },
      `Department diupdate: ${name} (${status})`
    );

    res.json({
      status: "success",
      message: "Department berhasil diupdate",
      data: department,
    });
  } catch (error) {
    console.error("Update department error:", error);
    res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan saat mengupdate department",
      data: null,
    });
  }
};

module.exports = updateDepartmentHandler;
