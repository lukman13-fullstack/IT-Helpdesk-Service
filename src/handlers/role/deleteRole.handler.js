const prisma = require("../../utils/prisma");
const { logDelete } = require("../../utils/logger");

const deleteRoleHandler = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        status: "error",
        message: "ID role tidak valid",
        data: null,
      });
    }

    // Check if role exists
    const existingRole = await prisma.role.findFirst({
      where: {
        id: parseInt(id),
        isDeleted: false,
      },
      include: {
        _count: {
          select: { users: true },
        },
      },
    });

    if (!existingRole) {
      return res.status(404).json({
        status: "error",
        message: "Role tidak ditemukan",
        data: null,
      });
    }

    // Check if role has users
    if (existingRole._count.users > 0) {
      return res.status(400).json({
        status: "error",
        message: `Tidak dapat menghapus role karena masih digunakan oleh ${existingRole._count.users} user`,
        data: null,
      });
    }

    // Soft delete role
    await prisma.role.update({
      where: { id: parseInt(id) },
      data: { isDeleted: true },
    });

    // Log the deletion
    await logDelete(
      "roles",
      req.user.id,
      parseInt(id),
      existingRole,
      `Role dihapus: ${existingRole.name}`
    );

    res.json({
      status: "success",
      message: "Role berhasil dihapus",
      data: null,
    });
  } catch (error) {
    console.error("Delete role error:", error);
    res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan saat menghapus role",
      data: null,
    });
  }
};

module.exports = deleteRoleHandler;
