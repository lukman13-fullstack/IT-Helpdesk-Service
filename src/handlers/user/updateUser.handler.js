const bcrypt = require("bcryptjs");
const { logUpdate } = require("../../utils/logger");
const prisma = require("../../utils/prisma");

const updateUserHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, username, email, password, roleId, departmentIds, position } =
      req.body;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        status: "error",
        message: "ID user tidak valid",
        data: null,
      });
    }

    if (!fullName || !username || !email || !roleId || !departmentIds) {
      return res.status(400).json({
        status: "error",
        message:
          "Semua field (fullName, username, email, roleId, departmentIds) wajib diisi",
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

    const existingUser = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      include: { 
        departments: {
          where: { isDeleted: false }
        } 
      },
    });

    if (!existingUser || existingUser.isDeleted) {
      return res.status(404).json({
        status: "error",
        message: "User tidak ditemukan",
        data: null,
      });
    }

    const duplicate = await prisma.user.findFirst({
      where: {
        OR: [
          { username, NOT: { id: parseInt(id) } },
          { email, NOT: { id: parseInt(id) } },
        ],
        isDeleted: false,
      },
    });

    if (duplicate) {
      return res.status(400).json({
        status: "error",
        message: "Username atau email sudah digunakan user lain",
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

    // Prepare data for update
    const data = {
      fullName,
      username,
      email,
      roleId: parseInt(roleId),
      position: position !== undefined ? (position || null) : undefined,
    };

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({
          status: "error",
          message: "Password minimal 6 karakter",
          data: null,
        });
      }
      data.password = await bcrypt.hash(password, 10);
      data.tokenVersion = { increment: 1 };
    }

    // Use transaction to handle user update and department sync (soft delete/restore)
    const updatedUser = await prisma.$transaction(async (tx) => {
      // 1. Update user basic info
      await tx.user.update({
        where: { id: parseInt(id) },
        data,
      });

      // 2. Handle Departments
      const userId = parseInt(id);

      // a. Soft delete ALL currently active departments for this user
      await tx.user_department.updateMany({
        where: { 
          userId: userId, 
          isDeleted: false 
        },
        data: { 
          isDeleted: true, 
          deletedAt: new Date() 
        }
      });

      // b. Restore or Create for selected departments
      for (const deptId of departmentIds) {
        const dId = parseInt(deptId);
        
        // Cek apakah relasi sudah ada (termasuk yang deleted)
        const existingRelation = await tx.user_department.findUnique({
            where: { 
              userId_departmentId: { 
                userId: userId, 
                departmentId: dId 
              } 
            }
        });

        if (existingRelation) {
          // Jika ada (baik active atau deleted), update jadi active
          await tx.user_department.update({
            where: { 
              userId_departmentId: { 
                userId: userId, 
                departmentId: dId 
              } 
            },
            data: { 
              isDeleted: false, 
              deletedAt: null 
            }
          });
        } else {
          // Jika tidak ada, buat baru
          await tx.user_department.create({
            data: { 
              userId: userId, 
              departmentId: dId,
              isDeleted: false
            }
          });
        }
      }

      // 3. Return updated user with relations
      return await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          fullName: true,
          email: true,
          position: true,
          createdAt: true,
          updatedAt: true,
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
    });

    await logUpdate(
      "users",
      req.user.id,
      parseInt(id),
      {
        fullName: existingUser.fullName,
        username: existingUser.username,
        email: existingUser.email,
        position: existingUser.position,
        roleId: existingUser.roleId,
        departmentIds: existingUser.departments.map((d) => d.departmentId),
      },
      { fullName, username, email, position, roleId, departmentIds },
      `User diupdate: ${fullName}`
    );

    res.json({
      status: "success",
      message: "User berhasil diupdate",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan saat mengupdate user",
      data: null,
    });
  }
};

module.exports = updateUserHandler;
