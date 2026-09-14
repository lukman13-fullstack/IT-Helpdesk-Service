const prisma = require("../../utils/prisma");

const getProfileHandler = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        createdAt: true,
        updatedAt: true,
        role: {
          select: {
            id: true,
            name: true,
            description: true,
            permissions: {
              select: {
                permission: {
                  select: {
                    name: true,
                    description: true,
                  },
                },
              },
            },
          },
        },
        departments: {
          where: { isDeleted: false },
          select: {
            department: {
              select: {
                id: true,
                name: true,
                description: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User tidak ditemukan",
        data: null,
      });
    }

    const transformedUser = {
      ...user,
      createdAt: user.createdAt?.toISOString(),
      updatedAt: user.updatedAt?.toISOString(),
    };

    res.json({
      status: "success",
      message: "Profil berhasil diambil",
      data: transformedUser,
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan saat mengambil profil",
      data: null,
    });
  }
};

module.exports = getProfileHandler;
