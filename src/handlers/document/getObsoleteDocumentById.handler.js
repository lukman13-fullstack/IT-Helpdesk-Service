const prisma = require("../../utils/prisma");

/**
 * Get obsolete document by ID
 * 
 * Permission: VIEW_OBSOLETE_DOCUMENTS
 * - Regular users: can only view obsolete documents from their own departments
 * - QA department users: can view obsolete documents from ALL departments
 */
async function getObsoleteDocumentByIdHandler(req, res) {
  try {
    const { id } = req.params;

    // Get user's departments
    const userDepartments = req.user.departments || [];
    const userDepartmentIds = userDepartments.map((dept) => dept.departmentId);

    // Check if user belongs to QA department
    const qaDepartment = await prisma.department.findFirst({
      where: {
        departmentCode: "QA",
        isDeleted: false,
      },
      select: { id: true },
    });

    const isQAUser = qaDepartment && userDepartmentIds.includes(qaDepartment.id);

    // Get obsolete document with full details
    const document = await prisma.document.findFirst({
      where: {
        id: parseInt(id),
        isDeleted: true,
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
        approvals: {
          include: {
            approver: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
            hierarchy: {
              select: {
                level: true,
              },
            },
          },
          orderBy: {
            level: "asc",
          },
        },
      },
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Obsolete document not found",
      });
    }

    // Check authorization - QA can see all, others only their departments
    if (!isQAUser) {
      const hasAccess = userDepartmentIds.includes(document.departmentId);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to view this obsolete document",
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: document,
    });
  } catch (error) {
    console.error("Error fetching obsolete document detail:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch obsolete document detail",
    });
  }
}

module.exports = getObsoleteDocumentByIdHandler;
