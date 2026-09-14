const prisma = require("../../utils/prisma");

/**
 * Get print history for a specific document
 * Returns all print_request records (regardless of status)
 * Available to anyone who can view the document
 */
async function getPrintHistoryHandler(req, res) {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;

    const documentId = parseInt(id);

    // Check if document exists
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true },
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    const whereCondition = {
      documentId,
    };

    const [total, printRequests] = await prisma.$transaction([
      prisma.print_request.count({ where: whereCondition }),
      prisma.print_request.findMany({
        where: whereCondition,
        take: limit,
        skip: skip,
        orderBy: { createdAt: "desc" },
        include: {
          document: {
            select: {
              id: true,
              name: true,
              documentCode: true,
              isInternal: true,
              googleDriveControlledVersionId: true,
              googleDriveUncontrolledVersionId: true,
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
    console.error("Error getting print history:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get print history",
    });
  }
}

module.exports = getPrintHistoryHandler;
