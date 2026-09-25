const prisma = require("../../utils/prisma");
const { logDelete } = require("../../utils/logger");

const deleteDepartmentHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const departmentId = parseInt(id);

    if (!id || isNaN(departmentId)) {
      return res.status(400).json({
        status: "error",
        message: "ID department tidak valid",
        data: null,
      });
    }

    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      include: {
        users: {
          where: { isDeleted: false },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                username: true,
                isDeleted: true,
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

    if (department.isDeleted) {
      return res.status(400).json({
        status: "error",
        message: "Department sudah dihapus sebelumnya",
        data: null,
      });
    }

    const activeUsers = department.users.filter((ud) => !ud.user.isDeleted);

    if (activeUsers.length > 0) {
      const activeUserNames = activeUsers
        .map((ud) => ud.user.fullName)
        .join(", ");

      return res.status(400).json({
        status: "error",
        message: `Tidak bisa menghapus department yang masih memiliki user aktif. User aktif: ${activeUserNames}`,
        data: {
          activeUsersCount: activeUsers.length,
          activeUsers: activeUsers.map((ud) => ({
            id: ud.user.id,
            fullName: ud.user.fullName,
            username: ud.user.username,
          })),
        },
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.department.update({
        where: { id: departmentId },
        data: { isDeleted: true },
      });

      await tx.user_department.updateMany({
        where: { departmentId: departmentId, isDeleted: false },
        data: { 
          isDeleted: true,
          deletedAt: new Date(),
        },
      });
    });

    await logDelete(
      "departments",
      req.user.id,
      departmentId,
      {
        name: department.name,
        description: department.description,
        departmentCode: department.departmentCode,
      },
      `Department dihapus: ${department.name}`
    );

    res.json({
      status: "success",
      message: "Department berhasil dihapus",
      data: null,
    });
  } catch (error) {
    console.error("Delete department error:", error);
    res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan saat menghapus department",
      data: null,
    });
  }
};

module.exports = deleteDepartmentHandler;
