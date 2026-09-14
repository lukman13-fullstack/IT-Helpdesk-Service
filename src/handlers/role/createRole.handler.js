const prisma = require("../../utils/prisma");
const { logCreate } = require("../../utils/logger");

const createRoleHandler = async (req, res) => {
  try {
    const { name, description, permissionIds } = req.body;

    if (!name) {
      return res.status(400).json({
        status: "error",
        message: "Nama role wajib diisi",
        data: null,
      });
    }

    // Check if role name already exists
    const existingRole = await prisma.role.findFirst({
      where: {
        name,
        isDeleted: false,
      },
    });

    if (existingRole) {
      return res.status(400).json({
        status: "error",
        message: "Nama role sudah digunakan",
        data: null,
      });
    }

    // Validate permissions if provided
    if (permissionIds && Array.isArray(permissionIds) && permissionIds.length > 0) {
      const permissionsCount = await prisma.permission.count({
        where: {
          id: { in: permissionIds },
          isDeleted: false,
        },
      });

      if (permissionsCount !== permissionIds.length) {
        return res.status(400).json({
          status: "error",
          message: "Satu atau lebih permission tidak ditemukan",
          data: null,
        });
      }
    }

    // Create role with permissions
    const role = await prisma.role.create({
      data: {
        name,
        description,
        permissions: {
          create: permissionIds?.map((permissionId) => ({
            permission: { connect: { id: permissionId } },
          })) || [],
        },
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
      },
    });

    // Log the creation
    await logCreate(
      "roles",
      req.user.id,
      role.id,
      {
        name,
        description,
        permissionIds,
      },
      `Role baru dibuat: ${name}`
    );

    // Transform permissions untuk response yang lebih clean
    const roleWithPermissions = {
      ...role,
      permissions: role.permissions.map(rp => rp.permission),
    };

    res.status(201).json({
      status: "success",
      message: "Role berhasil dibuat",
      data: roleWithPermissions,
    });
  } catch (error) {
    console.error("Create role error:", error);
    res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan saat membuat role",
      data: null,
    });
  }
};

module.exports = createRoleHandler;
