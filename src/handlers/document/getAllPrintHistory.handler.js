const prisma = require("../../utils/prisma");

/**
 * Get all print history handler
 * 
 * Following the concept of Obsolete Documents:
 * - Regular users: can only see print history from their own departments
 * - QA department users: can see print history from ALL departments
 */
async function getAllPrintHistoryHandler(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const departmentId = req.query.departmentId || null;
    const skip = (page - 1) * limit;

    // Get user's departments
    const userDepartments = req.user.departments || [];
    const userDepartmentIds = userDepartments.map((dept) => dept.departmentId);

    // If user has no departments, return empty
    if (userDepartmentIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      });
    }

    // Check if user belongs to QA department
    const qaDepartment = await prisma.department.findFirst({
      where: {
        departmentCode: "QA",
        isDeleted: false,
      },
      select: { id: true, name: true },
    });

    const isQAUser = qaDepartment && userDepartmentIds.includes(qaDepartment.id);

    // Build where clause
    const whereClause = {};

    // QA users can see ALL departments, others only their departments
    if (!isQAUser) {
      whereClause.document = {
        departmentId: {
          in: userDepartmentIds,
        },
      };
    }

    // Add search filter (search by document name, code, or requester name)
    if (search) {
      whereClause.OR = [
        {
          document: {
            OR: [
              { name: { contains: search } },
              { documentCode: { contains: search } },
            ],
          },
        },
        {
          requester: {
            fullName: { contains: search },
          },
        },
      ];
    }

    // Add specific department filter
    if (departmentId) {
      const deptId = parseInt(departmentId);
      if (isQAUser || userDepartmentIds.includes(deptId)) {
        if (!whereClause.document) whereClause.document = {};
        whereClause.document.departmentId = deptId;
      }
    }

    // Add status filter
    if (req.query.status) {
      whereClause.status = req.query.status;
    }

    // Add distribution filter
    if (req.query.distribution) {
      if (req.query.distribution === "Internal") {
        whereClause.isInternal = true;
      } else if (req.query.distribution === "External") {
        whereClause.isInternal = false;
      }
    }

    // Fetch print requests
    const [printRequests, total] = await Promise.all([
      prisma.print_request.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          document: {
            select: {
              id: true,
              name: true,
              documentCode: true,
              category: true,
              isInternal: true,
              googleDriveControlledVersionId: true,
              googleDriveUncontrolledVersionId: true,
              revision: true,
              status: true,
              departmentId: true,
              department: {
                select: {
                  id: true,
                  name: true,
                }
              }
            }
          },
          requester: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          approver: {
            select: {
              id: true,
              fullName: true,
            },
          },
          digitalApprovals: {
            include: {
              approver: {
                select: {
                  id: true,
                  fullName: true,
                }
              }
            },
            orderBy: {
              level: 'asc'
            }
          }
        },
      }),
      prisma.print_request.count({ where: whereClause }),
    ]);

    return res.status(200).json({
      success: true,
      data: printRequests,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching all print history:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch print history",
    });
  }
}

module.exports = getAllPrintHistoryHandler;
