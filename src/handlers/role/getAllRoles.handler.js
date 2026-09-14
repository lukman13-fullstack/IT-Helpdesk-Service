const prisma = require("../../utils/prisma");

const getAllRolesHandler = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    const skip = (page - 1) * limit;

    const whereClause = {
      isDeleted: false,
      ...(search && {
        OR: [
          { name: { contains: search } },
          { description: { contains: search } },
        ],
      }),
    };

    const [roles, total] = await Promise.all([
      prisma.role.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { 
              users: true,
              permissions: true,
            },
          },
          permissions: {
            select: {
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
        skip: parseInt(skip),
        take: parseInt(limit),
        orderBy: { name: "asc" },
      }),
      prisma.role.count({ where: whereClause }),
    ]);

    // Transform permissions untuk response yang lebih clean
    const rolesWithPermissions = roles.map(role => ({
      ...role,
      permissions: role.permissions.map(rp => rp.permission),
    }));

    res.json({
      status: "success",
      message: "Data role berhasil diambil",
      data: {
        roles: rolesWithPermissions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get all roles error:", error);
    res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan saat mengambil data role",
      data: null,
    });
  }
};

module.exports = getAllRolesHandler;
