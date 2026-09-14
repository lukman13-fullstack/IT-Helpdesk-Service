const bcrypt = require("bcryptjs");
const prisma = require("../../utils/prisma");
const { generateTokens } = require("../../utils/jwt");

const loginHandler = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        status: "error",
        message: "Username dan password harus diisi",
        data: null,
      });
    }

    const user = await prisma.user.findFirst({
      where: {
        username,
        isDeleted: false,
      },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
        departments: {
          where: { isDeleted: false },
          include: {
            department: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(401).json({
        status: "error",
        message: "Username tidak ditemukan",
        data: null,
      });
    }

    if (user.isDeleted) {
      return res.status(401).json({
        status: "error",
        message: "Akun tidak aktif",
        data: null,
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        status: "error",
        message: "Password salah",
        data: null,
      });
    }

    const { accessToken, refreshToken } = generateTokens(user);

    res.json({
      status: "success",
      message: "Login berhasil",
      data: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        role: {
          id: user.role.id,
          name: user.role.name,
        },
        permissions: user.role.permissions.map((rp) => rp.permission.name),
        departments: user.departments.map((ud) => ud.department.name),
        departmentIds: user.departments.map((ud) => ud.departmentId),
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan pada server",
      data: null,
    });
  }
};

module.exports = loginHandler;
