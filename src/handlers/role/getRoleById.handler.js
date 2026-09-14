const prisma = require("../../utils/prisma");

const getRoleByIdHandler = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        status: "error",
        message: "ID role tidak valid",
        data: null,
      });
    }

    const role = await prisma.role.findFirst({
      where: {
        id: parseInt(id),
        isDeleted: false,
      },
      include: {
        permissions: {
          include: {
            permission: {
              select: {
                id: true,
                name: true,
                description: true,
              },
            },
          },
        },
        users: {
          where: {
            isDeleted: false,
          },
          select: {
            id: true,
            fullName: true,
            username: true,
            email: true,
          },
        },
      },
    });

    if (!role) {
      return res.status(404).json({
        status: "error",
        message: "Role tidak ditemukan",
        data: null,
      });
    }

    // Transform permissions untuk response yang lebih clean
    const roleWithPermissions = {
      ...role,
      permissions: role.permissions.map(rp => rp.permission),
    };

    res.json({
      status: "success",
      message: "Data role berhasil diambil",
      data: roleWithPermissions,
    });
  } catch (error) {
    console.error("Get role by ID error:", error);
    res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan saat mengambil data role",
      data: null,
    });
  }
};

module.exports = getRoleByIdHandler;
