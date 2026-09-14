const bcrypt = require("bcryptjs");
const { logCreate } = require("../../utils/logger");
const prisma = require("../../utils/prisma");

const createUserHandler = async (req, res) => {
  try {
    const { username, fullName, email, password, roleId, departmentIds, position } =
      req.body;

    if (
      !username ||
      !fullName ||
      !email ||
      !password ||
      !roleId ||
      !departmentIds
    ) {
      return res.status(400).json({
        status: "error",
        message: "Semua field wajib diisi",
        data: null,
      });
    }

    if (!Array.isArray(departmentIds) || departmentIds.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "Department harus berupa array dan tidak boleh kosong",
        data: null,
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        status: "error",
        message: "Format email tidak valid",
        data: null,
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        status: "error",
        message: "Password minimal 6 karakter",
        data: null,
      });
    }

    // Check for active users with same username or email
    const existingActiveUser = await prisma.user.findFirst({
      where: {
        OR: [{ username }, { email }],
        isDeleted: false,
      },
    });

    if (existingActiveUser) {
      return res.status(400).json({
        status: "error",
        message: "Username atau email sudah digunakan",
        data: null,
      });
    }

    const role = await prisma.role.findFirst({
      where: {
        id: parseInt(roleId),
        isDeleted: false,
      },
    });

    if (!role) {
      return res.status(400).json({
        status: "error",
        message: "Role tidak ditemukan",
        data: null,
      });
    }

    const departmentsCount = await prisma.department.count({
      where: {
        id: {
          in: departmentIds.map((id) => parseInt(id)),
        },
        isDeleted: false,
      },
    });

    if (departmentsCount !== departmentIds.length) {
      return res.status(400).json({
        status: "error",
        message: "Satu atau lebih department tidak ditemukan",
        data: null,
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        fullName,
        email,
        password: hashedPassword,
        roleId: parseInt(roleId),
        position: position || null,
        tokenVersion: 0,
        departments: {
          create: departmentIds.map((id) => ({
            department: {
              connect: { id: parseInt(id) },
            },
          })),
        },
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        position: true,
        createdAt: true,
        role: {
          select: {
            id: true,
            name: true,
            description: true,
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

    await logCreate(
      "users",
      req.user.id,
      user.id,
      { username, fullName, email, roleId, departmentIds, position },
      `User baru dibuat: ${fullName}`
    );

    res.status(201).json({
      status: "success",
      message: "User berhasil dibuat",
      data: user,
    });
  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan saat membuat user",
      data: null,
    });
  }
};

module.exports = createUserHandler;
