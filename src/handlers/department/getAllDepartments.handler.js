const prisma = require("../../utils/prisma");

/**
 * Get All Departments Handler
 *
 * Returns paginated list of departments with:
 * - Active users count (only non-deleted users)
 * - Published documents count
 */
const getAllDepartmentsHandler = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    const skip = (page - 1) * limit;

    const whereClause = {
      isDeleted: false,
      ...(search && {
        OR: [
          { name: { contains: search } },
          { departmentCode: { contains: search } },
          { description: { contains: search } },
        ],
      }),
    };

    const [departments, total] = await Promise.all([
      prisma.department.findMany({
        where: whereClause,
        select: {
          id: true,
          departmentCode: true,
          name: true,
          description: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          // Get only active user_department relations
          users: {
            where: { isDeleted: false },
            select: {
              user: {
                select: {
                  id: true,
                  isDeleted: true,
                },
              },
            },
          },
          _count: {
            select: {
              tickets: {
                where: {
                  status: {
                    not: "CLOSED"
                  }
                },
              },
            },
          },
        },
        skip: parseInt(skip),
        take: parseInt(limit),
        orderBy: { name: "asc" },
      }),
      prisma.department.count({ where: whereClause }),
    ]);

    // Transform data to include only active users count
    const transformedDepartments = departments.map((dept) => {
      // Count only users that are NOT soft-deleted
      const activeUsersCount = dept.users.filter(
        (ud) => !ud.user.isDeleted
      ).length;

      return {
        id: dept.id,
        departmentCode: dept.departmentCode,
        name: dept.name,
        description: dept.description,
        status: dept.status,
        createdAt: dept.createdAt,
        updatedAt: dept.updatedAt,
        _count: {
          users: activeUsersCount,
          tickets: dept._count.tickets,
        },
      };
    });

    res.json({
      status: "success",
      message: "Data department berhasil diambil",
      data: {
        departments: transformedDepartments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get all departments error:", error);
    res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan saat mengambil data department",
      data: null,
    });
  }
};

module.exports = getAllDepartmentsHandler;
