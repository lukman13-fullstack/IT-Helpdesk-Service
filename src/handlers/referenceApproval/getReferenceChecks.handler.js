const prisma = require("../../utils/prisma");

/**
 * Get pending reference checks for the current user (if they are assigned as a checker)
 */
async function getReferenceChecksHandler(req, res) {
  try {
    const userId = req.user.id;
    const { status = "pending", page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Find all reference links where:
    // 1. The reference has this user as the checker
    // 2. The status matches the filter
    const where = {
      reference: {
        checkerId: userId,
        isActive: true,
      },
    };

    if (status !== "all") {
      where.status = status;
    }

    const [referenceLinks, total] = await Promise.all([
      prisma.document_reference_link.findMany({
        where,
        include: {
          document: {
            select: {
              id: true,
              name: true,
              documentCode: true,
              category: true,
              status: true,
              uploader: {
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
          },
          reference: {
            select: {
              id: true,
              name: true,
              code: true,
              checker: {
                select: {
                  id: true,
                  fullName: true,
                },
              },
            },
          },
          checker: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.document_reference_link.count({ where }),
    ]);

    return res.status(200).json({
      success: true,
      data: referenceLinks,
      pagination: {
        page: parseInt(page),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    console.error("Error getting reference checks:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get reference checks",
    });
  }
}

module.exports = getReferenceChecksHandler;
