const prisma = require("../../utils/prisma");

const getUsersByDepartmentHandler = async (req, res) => {
  try {
    const { departmentId } = req.params;
    const { page = 1, limit = 10, search = "" } = req.query;
    const skip = (page - 1) * limit;

    if (!departmentId || isNaN(parseInt(departmentId))) {
      return res.status(400).json({
        status: "error",
        message: "ID department tidak valid",
        data: null,
      });
    }

    const department = await prisma.department.findUnique({
      where: { id: parseInt(departmentId) },
    });

    if (!department || department.isDeleted) {
      return res.status(404).json({
        status: "error",
        message: "Department tidak ditemukan",
        data: null,
      });
    }

    const whereClause = {
      departments: {
        some: {
          departmentId: parseInt(departmentId),
          isDeleted: false,
        },
      },
      isDeleted: false,
      ...(search && {
        OR: [
          { username: { contains: search } },
          { fullName: { contains: search } },
          { email: { contains: search } },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: whereClause,
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
        skip: parseInt(skip),
        take: parseInt(limit),
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({ where: whereClause }),
    ]);

    res.json({
      status: "success",
      message: "Data user berdasarkan department berhasil diambil",
      data: {
        department: {
          id: department.id,
          name: department.name,
          description: department.description,
        },
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get users by department error:", error);
    res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan saat mengambil data user",
      data: null,
    });
  }
};

module.exports = getUsersByDepartmentHandler;
