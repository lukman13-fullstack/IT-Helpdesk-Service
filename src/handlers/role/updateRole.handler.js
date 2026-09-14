const prisma = require("../../utils/prisma");
const { logUpdate } = require("../../utils/logger");

const updateRoleHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, permissionIds } = req.body;

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
        permissions: {
          include: {
            permission: {
              select: {
                id: true,
                name: true,
              },
            },
          },
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

    // Check if new name already exists (if name is being updated)
    if (name && name !== existingRole.name) {
      const duplicateRole = await prisma.role.findFirst({
        where: {
          name,
          isDeleted: false,
          id: { not: parseInt(id) },
        },
      });

      if (duplicateRole) {
        return res.status(400).json({
          status: "error",
          message: "Nama role sudah digunakan",
          data: null,
        });
      }
    }

    // Validate permissions if provided
    if (permissionIds && Array.isArray(permissionIds)) {
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

    // Update role
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;

    // Update role and permissions
    const role = await prisma.role.update({
      where: { id: parseInt(id) },
      data: updateData,
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

    // Update permissions if provided
    if (permissionIds !== undefined && Array.isArray(permissionIds)) {
      // Delete existing permissions
      await prisma.role_permission.deleteMany({
        where: { roleId: parseInt(id) },
      });

      // Create new permissions
      if (permissionIds.length > 0) {
        await prisma.role_permission.createMany({
          data: permissionIds.map((permissionId) => ({
            roleId: parseInt(id),
            permissionId,
          })),
        });
      }

      // Fetch updated role with permissions
      const updatedRole = await prisma.role.findUnique({
        where: { id: parseInt(id) },
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

      // Transform permissions
      const roleWithPermissions = {
        ...updatedRole,
        permissions: updatedRole.permissions.map(rp => rp.permission),
      };

      // Log the update
      await logUpdate(
        "roles",
        req.user.id,
        parseInt(id),
        existingRole,
        { name, description, permissionIds },
        `Role diupdate: ${roleWithPermissions.name}`
      );

      return res.json({
        status: "success",
        message: "Role berhasil diupdate",
        data: roleWithPermissions,
      });
    }

    // Transform permissions
    const roleWithPermissions = {
      ...role,
      permissions: role.permissions.map(rp => rp.permission),
    };

    // Log the update
    await logUpdate(
      "roles",
      req.user.id,
      parseInt(id),
      existingRole,
      { name, description },
      `Role diupdate: ${roleWithPermissions.name}`
    );

    res.json({
      status: "success",
      message: "Role berhasil diupdate",
      data: roleWithPermissions,
    });
  } catch (error) {
    console.error("Update role error:", error);
    res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan saat mengupdate role",
      data: null,
    });
  }
};

module.exports = updateRoleHandler;
