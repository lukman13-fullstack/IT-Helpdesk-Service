const prisma = require("../../utils/prisma");

/**
 * Convert permission name to readable display name
 * @param {string} name - Permission name (e.g., UPLOAD_DOCUMENT)
 * @returns {string} - Display name (e.g., Upload Document)
 */
const formatPermissionName = (name) => {
  return name
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

const getAllPermissionsHandler = async (req, res) => {
  try {
    const { page, limit, search = "" } = req.query;

    const whereClause = {
      isDeleted: false,
      ...(search && {
        OR: [
          { name: { contains: search } },
          { description: { contains: search } },
        ],
      }),
    };

    // If pagination is requested
    if (page && limit) {
      const skip = (page - 1) * limit;

      const [permissions, total] = await Promise.all([
        prisma.permission.findMany({
          where: whereClause,
          select: {
            id: true,
            name: true,
            description: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: { roles: true },
            },
          },
          skip: parseInt(skip),
          take: parseInt(limit),
          orderBy: { name: "asc" },
        }),
        prisma.permission.count({ where: whereClause }),
      ]);

      // Add displayName to each permission
      const formattedPermissions = permissions.map((permission) => ({
        ...permission,
        displayName: formatPermissionName(permission.name),
      }));

      return res.json({
        status: "success",
        message: "Data permission berhasil diambil",
        data: {
          permissions: formattedPermissions,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
      });
    }

    // Without pagination - return all permissions
    const permissions = await prisma.permission.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        description: true,
      },
      orderBy: { name: "asc" },
    });

    // Add displayName to each permission
    const formattedPermissions = permissions.map((permission) => ({
      ...permission,
      displayName: formatPermissionName(permission.name),
    }));

    res.json({
      status: "success",
      message: "Data permission berhasil diambil",
      data: formattedPermissions,
    });
  } catch (error) {
    console.error("Get all permissions error:", error);
    res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan saat mengambil data permission",
      data: null,
    });
  }
};

module.exports = getAllPermissionsHandler;
