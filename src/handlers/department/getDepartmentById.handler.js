const prisma = require("../../utils/prisma");

const getDepartmentByIdHandler = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        status: "error",
        message: "ID department tidak valid",
        data: null,
      });
    }

    const department = await prisma.department.findUnique({
      where: {
        id: parseInt(id),
        isDeleted: false,
      },
      select: {
        id: true,
        name: true,
        description: true,
        departmentCode: true,
        createdAt: true,
        updatedAt: true,
        users: {
          where: { isDeleted: false },
          select: {
            user: {
              select: {
                id: true,
                username: true,
                fullName: true,
                email: true,
              },
            },
          },
        },

      },
    });

    if (!department) {
      return res.status(404).json({
        status: "error",
        message: "Department tidak ditemukan",
        data: null,
      });
    }

    res.json({
      status: "success",
      message: "Data department berhasil diambil",
      data: department,
    });
  } catch (error) {
    console.error("Get department by ID error:", error);
    res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan saat mengambil data department",
      data: null,
    });
  }
};

module.exports = getDepartmentByIdHandler;
