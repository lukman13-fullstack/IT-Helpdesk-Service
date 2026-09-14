const prisma = require("../../utils/prisma");

/**
 * Get print request detail by ID
 */
async function getPrintRequestByIdHandler(req, res) {
  try {
    const { id } = req.params;
    const printRequestId = parseInt(id);

    if (isNaN(printRequestId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid print request ID",
      });
    }

    const printRequest = await prisma.print_request.findUnique({
      where: { id: printRequestId },
      include: {
        document: {
          include: {
            department: {
              select: {
                id: true,
                name: true,
                departmentCode: true,
              }
            },
            uploader: {
              select: {
                id: true,
                fullName: true,
              }
            }
          }
        },
        requester: {
          select: {
            id: true,
            fullName: true,
            email: true,
            position: true,
          }
        },
        approver: {
          select: {
            id: true,
            fullName: true,
          }
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
      }
    });

    if (!printRequest) {
      return res.status(404).json({
        success: false,
        message: "Print request not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: printRequest,
    });
  } catch (error) {
    console.error("Error fetching print request detail:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch print request detail",
    });
  }
}

module.exports = getPrintRequestByIdHandler;
