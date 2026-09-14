const prisma = require("../../utils/prisma");

/**
 * Get obsolete documents handler
 * 
 * Permission: VIEW_OBSOLETE_DOCUMENTS
 * - Regular users: can only see obsolete documents from their own departments
 * - QA department users: can see obsolete documents from ALL departments
 */
async function getObsoleteDocumentsHandler(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const departmentId = req.query.departmentId || null;
    const skip = (page - 1) * limit;

    // Get user's departments
    const userDepartments = req.user.departments || [];
    const userDepartmentIds = userDepartments.map((dept) => dept.departmentId);

    // Debug logging
    console.log("=== GET OBSOLETE DOCUMENTS ===");
    console.log("User:", req.user.fullName);
    console.log("User Departments:", userDepartments);
    console.log("User Department IDs:", userDepartmentIds);

    // If user has no departments, return empty
    if (userDepartmentIds.length === 0) {
      console.log("WARNING: User has no departments!");
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

    console.log("QA Department:", qaDepartment);

    const isQAUser = qaDepartment && userDepartmentIds.includes(qaDepartment.id);
    console.log("Is QA User:", isQAUser);

    // Build where clause
    const whereClause = {
      isDeleted: true, // Obsolete documents have isDeleted: true
      AND: [
        {
          OR: [
            { deletionReason: null },
            {
              deletionReason: {
                not: {
                  contains: "Force deleted",
                },
              },
            },
          ],
        },
      ],
    };

    // QA users can see ALL departments, others only their departments
    if (!isQAUser) {
      whereClause.departmentId = {
        in: userDepartmentIds,
      };
    }

    // Add search filter
    if (search) {
      whereClause.AND.push({
        OR: [
          { name: { contains: search } },
          { description: { contains: search } },
          { documentCode: { contains: search } },
        ],
      });
    }

    // Add specific department filter (for QA filtering by department)
    if (departmentId) {
      const deptId = parseInt(departmentId);
      // QA can filter by any department, others must be in their list
      if (isQAUser || userDepartmentIds.includes(deptId)) {
        whereClause.departmentId = deptId;
      }
    }

    console.log("Where Clause:", JSON.stringify(whereClause, null, 2));

    // Count all obsolete documents first (for debugging)
    const totalObsolete = await prisma.document.count({
      where: { isDeleted: true },
    });
    console.log("Total Obsolete Documents in System:", totalObsolete);

    // Count obsolete by department
    if (!isQAUser && userDepartmentIds.length > 0) {
      const obsoleteInUserDepts = await prisma.document.count({
        where: {
          isDeleted: true,
          departmentId: { in: userDepartmentIds },
        },
      });
      console.log("Obsolete Documents in User's Departments:", obsoleteInUserDepts);
    }

    // Fetch documents
    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: {
          updatedAt: "desc",
        },
        include: {
          department: {
            select: {
              id: true,
              name: true,
              departmentCode: true,
            },
          },
          uploader: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
      }),
      prisma.document.count({ where: whereClause }),
    ]);

    console.log("Documents Found:", documents.length);
    console.log("Total Count:", total);
    console.log("==============================");

    return res.status(200).json({
      success: true,
      data: documents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching obsolete documents:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch obsolete documents",
    });
  }
}

module.exports = getObsoleteDocumentsHandler;
