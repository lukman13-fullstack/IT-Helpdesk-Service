const prisma = require("../../utils/prisma");
const { DocumentCategory } = require("@prisma/client");
const {
  canViewAllDocuments,
  getUserDepartmentIds,
} = require("../../utils/authorization.util");
const { calculateApprovalProgress } = require("../../utils/approvalProgress.util");

async function getAllDocumentsHandler(req, res) {
  try {
    const {
      page = 1,
      limit = 10,
      departmentId,
      status,
      isInternal,
      category,
      search,
      destination,
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where = {
      isDeleted: false,
    };

    // Department-based authorization
    const hasViewAllAccess = canViewAllDocuments(req.user);
    if (!hasViewAllAccess) {
      // User can only see documents from their departments
      const userDepartmentIds = getUserDepartmentIds(req.user);
      where.departmentId = { in: userDepartmentIds };
    }

    if (departmentId) {
      where.departmentId = parseInt(departmentId);
    }

    if (status) {
      where.status = status;
    }

    if (isInternal !== undefined && isInternal !== '') {
      where.isInternal = isInternal === 'true' || isInternal === true;
    }

    if (destination) {
      if (destination === "QA" || destination === "MR") {
        // Old logic for QA/MR destination field
        where.destination = destination;
      } else {
        // New logic: Filter by department name or code for other multi-department users
        const targetDept = await prisma.department.findFirst({
          where: { 
            OR: [
              { name: destination },
              { departmentCode: destination }
            ],
            isDeleted: false 
          },
        });
        if (targetDept) {
          where.departmentId = targetDept.id;
        } else {
          // If destination is specified but not found, force an empty result
          where.departmentId = -1; 
        }
      }
    }

    if (category) {
      let categories;
      if (Array.isArray(category)) {
        categories = category;
      } else {
        categories = category.split(",");
      }
      where.category = { in: categories };
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { documentCode: { contains: search } },
        { description: { contains: search } },
      ];

      const matchingCategories = Object.values(DocumentCategory).filter((cat) =>
        cat.toLowerCase().includes(search.toLowerCase())
      );

      if (matchingCategories.length > 0) {
        where.OR.push({ category: { in: matchingCategories } });
      }
    }

    const total = await prisma.document.count({ where });

    const documents = await prisma.document.findMany({
      where,
      skip,
      take,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        department: {
          select: {
            id: true,
            name: true,
            departmentCode: true,
            hierarchies: {
              where: { isDeleted: false },
              select: {
                id: true,
                level: true,
                user: { select: { fullName: true } }
              }
            },
            categoryHierarchies: {
              where: { isDeleted: false },
              select: {
                id: true,
                level: true,
                category: true,
                user: { select: { fullName: true } }
              }
            }
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
          select: {
            id: true,
            level: true,
            status: true,
            type: true,
            approvedAt: true,
            documentRevision: true,
            reason: true,
            approver: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
          orderBy: {
            level: "asc",
          },
        },
        references: {
          include: {
            checker: {
              select: {
                id: true,
                fullName: true,
              }
            },
            reference: {
              include: {
                checker: {
                  select: {
                    fullName: true,
                    email: true,
                  }
                }
              }
            }
          }
        }
      },
    });

    // Calculate Progress for each document
    const documentsWithProgress = documents.map(doc => {
      return {
        ...doc,
        approvalProgress: calculateApprovalProgress(doc)
      };
    });

    const totalPages = Math.ceil(total / take);

    return res.status(200).json({
      success: true,
      data: documentsWithProgress,
      pagination: {
        page: parseInt(page),
        limit: take,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error("Error getting documents:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get documents",
    });
  }
}

module.exports = getAllDocumentsHandler;
