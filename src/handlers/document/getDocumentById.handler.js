const prisma = require("../../utils/prisma");
const {
  canViewAllDocuments,
  userBelongsToDepartment,
} = require("../../utils/authorization.util");
const { calculateApprovalProgress } = require("../../utils/approvalProgress.util");

async function getDocumentByIdHandler(req, res) {
  try {
    const { id } = req.params;

    const document = await prisma.document.findFirst({
      where: {
        id: parseInt(id),
        isDeleted: false,
      },
      include: {
        department: {
          select: {
            id: true,
            name: true,
            departmentCode: true,
            description: true,
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
          orderBy: {
            level: "asc",
          },
          include: {
            approver: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
            approvedByUser: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
        history: {
          orderBy: {
            createdAt: "desc",
          },
          include: {
            changer: {
              select: {
                id: true,
                fullName: true,
              },
            },
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
              select: {
                id: true,
                name: true,
                code: true,
                description: true,
                checker: {
                  select: {
                    fullName: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
        workInstructionTemplates: {
          where: { isActive: true },
          orderBy: { revision: "desc" },
          take: 1,
        },
      },
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Filter references to only include those for the current document revision
    if (document.references && document.references.length > 0) {
      document.references = document.references.filter(
        (ref) => ref.documentRevision === document.revision
      );
    }

    // Check access permissions
    // If the document is published (shared), anyone can view it.
    // If not published (draft, pending, etc.), enforce department/permission checks.
    if (!document.isPublished) {
      const hasViewAllAccess = canViewAllDocuments(req.user);
      if (!hasViewAllAccess) {
        const hasAccess = userBelongsToDepartment(
          req.user,
          document.departmentId
        );
        if (!hasAccess) {
          return res.status(403).json({
            success: false,
            message: "You don't have permission to access this document",
          });
        }
      }
    }

    // Get all print requests for this document
    // If Super Admin, get all (to see shortcuts). Otherwise just own.
    const { isSuperAdmin } = require("../../utils/authorization.util");
    const printRequestWhere = {
      documentId: parseInt(id),
    };
    
    if (!isSuperAdmin(req.user)) {
      printRequestWhere.requesterId = req.user.id;
    }

    const allPrintRequests = await prisma.print_request.findMany({
      where: printRequestWhere,
      orderBy: {
        createdAt: "desc",
      },
    });

    // Check for expired requests and update status
    const { isExpired } = require("../../utils/workingDays.util");
    for (const pr of allPrintRequests) {
      if (pr.status === "approved" && pr.expiresAt && isExpired(pr.expiresAt)) {
        await prisma.print_request.update({
          where: { id: pr.id },
          data: { status: "expired" },
        });
        pr.status = "expired";
      }
    }

    // Get active (approved, non-expired, or already processed) requests for shortcut buttons
    const activeRequests = allPrintRequests
      .filter((pr) => ["approved", "printed", "ready", "completed"].includes(pr.status))
      .map((pr) => ({
        id: pr.id,
        isInternal: pr.isInternal,
        approvedAt: pr.approvedAt,
        expiresAt: pr.expiresAt,
        printedAt: pr.printedAt,
        type: pr.isInternal ? "controlled" : "uncontrolled",
      }));

    // Get pending requests
    const pendingRequests = allPrintRequests
      .filter((pr) => pr.status === "pending")
      .map((pr) => ({
        id: pr.id,
        isInternal: pr.isInternal,
        createdAt: pr.createdAt,
        type: pr.isInternal ? "controlled" : "uncontrolled",
      }));
    
    // Requests that currently block requesting another of the same type (following requestPrint logic)
    const limitingRequests = allPrintRequests.filter((pr) => 
      ["pending", "approved"].includes(pr.status)
    );

    // Backward compatible: set printRequestStatus based on latest request
    let printRequestStatus = null;
    if (allPrintRequests.length > 0) {
      printRequestStatus = allPrintRequests[0].status;
    }

    // Calculate Progress
    const progress = calculateApprovalProgress(document);

    return res.status(200).json({
      success: true,
      data: {
        ...document,
        approvalProgress: progress,
        printRequestStatus,
        printRequests: activeRequests,
        pendingPrintRequests: pendingRequests,
        hasActivePrintRequests: activeRequests.length > 0,
        canRequestMore: limitingRequests.length < 2,
      },
    });
  } catch (error) {
    console.error("Error getting document:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get document",
    });
  }
}

module.exports = getDocumentByIdHandler;
