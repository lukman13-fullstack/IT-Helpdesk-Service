const prisma = require("../../utils/prisma");
const { logDelete } = require("../../utils/logger");

const deleteUserHandler = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        status: "error",
        message: "ID user tidak valid",
        data: null,
      });
    }

    if (req.user.id === parseInt(id)) {
      return res.status(400).json({
        status: "error",
        message: "Tidak bisa menghapus user sendiri",
        data: null,
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        isDeleted: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User tidak ditemukan",
        data: null,
      });
    }

    if (user.isDeleted) {
      return res.status(400).json({
        status: "error",
        message: "User sudah dihapus",
        data: null,
      });
    }

    // Gunakan transaction untuk memastikan konsistensi data
    await prisma.$transaction(async (tx) => {
      // 1. Soft delete user
      await tx.user.update({
        where: { id: parseInt(id) },
        data: { isDeleted: true },
      });

      // 2. Soft delete relasi user_department
      await tx.user_department.updateMany({
        where: { userId: parseInt(id), isDeleted: false },
        data: { 
          isDeleted: true,
          deletedAt: new Date(),
        },
      });

      // 3. Soft delete hierarchy terkait user ini
      await tx.hierarchy.updateMany({
        where: { userId: parseInt(id), isDeleted: false },
        data: { isDeleted: true },
      });
    });

    await logDelete(
      "users",
      req.user.id,
      parseInt(id),
      {
        fullName: user.fullName,
        username: user.username,
        email: user.email,
      },
      `User dihapus: ${user.fullName}`
    );

    res.json({
      status: "success",
      message: "User berhasil dihapus",
      data: null,
    });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan saat menghapus user",
      data: null,
    });
  }
};

module.exports = deleteUserHandler;
