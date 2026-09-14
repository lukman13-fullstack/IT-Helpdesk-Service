const prisma = require("../../utils/prisma");

async function getAllLogsHandler(req, res) {
  try {
    const {
      page = 1,
      limit = 50,
      departmentId,
      userId,
      action,
      startDate,
      endDate,
    } = req.query;

    // Check if user has VIEW_ALL_LOGS permission
    const userPermissions = req.user.role.permissions.map(
      (rp) => rp.permission.name
    );
    const canViewAllLogs = userPermissions.includes("VIEW_ALL_LOGS");

    // Build where clause
    const where = {};

    // If user doesn't have VIEW_ALL_LOGS, filter by their departments
    if (!canViewAllLogs) {
      const userDepartmentIds = req.user.departments.map(
        (ud) => ud.departmentId
      );
      where.departmentId = {
        in: userDepartmentIds,
      };
    }

    // Apply additional filters
    if (departmentId) {
      where.departmentId = parseInt(departmentId);
    }

    if (userId) {
      where.userId = parseInt(userId);
    }

    if (action) {
      where.action = action;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    // Get total count
    const total = await prisma.log.count({ where });

    // Get logs with pagination
    const logs = await prisma.log.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
            departmentCode: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
    });

    return res.status(200).json({
      success: true,
      data: {
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching logs:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch logs",
    });
  }
}

module.exports = getAllLogsHandler;
