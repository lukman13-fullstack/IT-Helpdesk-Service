const prisma = require("../../utils/prisma");
const {
  canViewAllDocuments,
  userBelongsToDepartment,
} = require("../../utils/authorization.util");
const { createLog } = require("../../utils/logger");
const { calculateApprovalProgress } = require("../../utils/approvalProgress.util");

async function togglePublishDocumentHandler(req, res) {
  try {
    const { id } = req.params;
    const { isPublished } = req.body;

    if (typeof isPublished !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isPublished must be a boolean",
      });
    }

    const existingDocument = await prisma.document.findFirst({
      where: {
        id: parseInt(id),
        isDeleted: false,
      },
    });

    if (!existingDocument) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    if (existingDocument.status !== "approved") {
      return res.status(400).json({
        success: false,
        message: "Only approved documents can be published",
      });
    }

    // Check department access
    const hasViewAllAccess = canViewAllDocuments(req.user);
    if (!hasViewAllAccess) {
      const hasAccess = userBelongsToDepartment(
        req.user,
        existingDocument.departmentId
      );
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to update this document",
        });
      }
    }

    // Update document
    const document = await prisma.document.update({
      where: { id: parseInt(id) },
      data: {
        isPublished,
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
          select: {
            id: true,
            level: true,
            status: true,
            type: true,
            approvedAt: true,
            documentRevision: true,
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
                reference: true
            }
        },
      },
    });

    // Calculate progress to preserve UI state
    const documentWithProgress = {
      ...document,
      approvalProgress: calculateApprovalProgress(document)
    };

    // Log publish/unpublish action
    await createLog({
      action: isPublished ? "PUBLISH" : "UNPUBLISH",
      table: "document",
      userId: req.user.id,
      description: `User ${req.user.fullName} ${
        isPublished ? "mempublikasikan" : "membatalkan publikasi"
      } document ${document.documentCode} - ${document.name} di departemen ${
        document.department.name
      }`,
      departmentId: document.departmentId,
    });

    return res.status(200).json({
      success: true,
      message: `Document ${
        isPublished ? "published" : "unpublished"
      } successfully`,
      data: documentWithProgress,
    });
  } catch (error) {
    console.error("Error toggling publish status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to toggle publish status",
    });
  }
}

module.exports = togglePublishDocumentHandler;
