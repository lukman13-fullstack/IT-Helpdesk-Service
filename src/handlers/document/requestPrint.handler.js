const prisma = require("../../utils/prisma");
const { createBulkNotifications } = require("../../utils/notification.util");
const {
  canBypassApproval,
  canViewAllDocuments,
  userBelongsToDepartment,
  isSuperAdmin,
} = require("../../utils/authorization.util");
const {
  calculateExpiryDate,
  isExpired,
} = require("../../utils/workingDays.util");
const { calculateApprovalProgress } = require("../../utils/approvalProgress.util");

async function requestPrintHandler(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const document = await prisma.document.findUnique({
      where: { id: parseInt(id) },
      include: {
        department: {
          include: {
            categoryHierarchies: {
              where: { isDeleted: false },
            },
          },
        },
        approvals: {
          include: {
            approver: {
              select: { id: true, fullName: true },
            },
          },
        },
        references: {
          include: {
            checker: { select: { id: true, fullName: true } },
          },
        },
        uploader: {
          select: { id: true, fullName: true },
        },
      },
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Check if document is fully approved (100%)
    const progress = calculateApprovalProgress(document);
    if (document.status !== "approved" || progress.percentage !== 100) {
      return res.status(400).json({
        success: false,
        message: "Print requests are only allowed for documents that are 100% approved by all levels.",
      });
    }

    // Check permissions
    const hasViewAllAccess = canViewAllDocuments(req.user);
    if (!hasViewAllAccess) {
      const hasDepartmentAccess = userBelongsToDepartment(
        req.user,
        document.departmentId
      );
      if (!hasDepartmentAccess) {
        return res.status(403).json({
          success: false,
          message:
            "You don't have permission to request print for this document.",
        });
      }
    }

    const hasBypassPermission = canBypassApproval(req.user);
    const {
      reason,
      copies,
      storageLocation,
      isInternal,
      numberRevision,
      distribution,
    } = req.body;

    // Validate distribution
    const finalDistribution =
      distribution ||
      (isInternal !== undefined
        ? isInternal
          ? "Internal"
          : "External"
        : null);

    if (!finalDistribution) {
      return res.status(400).json({
        success: false,
        message: "Please specify the distribution type (Internal or External).",
      });
    }

    const requestedType = finalDistribution === "Internal";

    // Check existing requests
    const existingRequests = await prisma.print_request.findMany({
      where: {
        documentId: parseInt(id),
        requesterId: userId,
        status: { in: ["pending", "approved"] },
      },
    });

    // Check for expired and update
    for (const req of existingRequests) {
      if (
        req.status === "approved" &&
        req.expiresAt &&
        isExpired(req.expiresAt)
      ) {
        await prisma.print_request.update({
          where: { id: req.id },
          data: { status: "expired" },
        });
      }
    }

    // Re-fetch active requests
    const activeRequests = await prisma.print_request.findMany({
      where: {
        documentId: parseInt(id),
        requesterId: userId,
        status: { in: ["pending", "approved"] },
      },
    });

    // Validate: no duplicate type requests
    const hasInternalActive = activeRequests.some(
      (r) => r.distribution === "Internal" || r.isInternal === true
    );
    const hasExternalActive = activeRequests.some(
      (r) => r.distribution === "External" || r.isInternal === false
    );

    if (requestedType && hasInternalActive) {
      return res.status(400).json({
        success: false,
        message: "You already have an active Internal print request.",
      });
    }

    if (!requestedType && hasExternalActive) {
      return res.status(400).json({
        success: false,
        message: "You already have an active External print request.",
      });
    }

    if (hasInternalActive && hasExternalActive) {
      return res.status(400).json({
        success: false,
        message: "Maximum 2 requests reached (one Internal, one External).",
      });
    }

    // Calculate expiry if bypass
    const approvedAt = hasBypassPermission ? new Date() : null;
    const expiresAt = hasBypassPermission
      ? calculateExpiryDate(approvedAt)
      : null;

    // Create print_request
    const printRequest = await prisma.print_request.create({
      data: {
        documentId: parseInt(id),
        requesterId: userId,
        status: hasBypassPermission ? "approved" : "pending",
        reason: reason || "No reason provided",
        copies: parseInt(copies) || 1,
        numberRevision: numberRevision || null,
        distribution: finalDistribution,
        storageLocation: storageLocation || "Not specified",
        isInternal: requestedType,
        approvedBy: hasBypassPermission ? userId : null,
        approvedAt: approvedAt,
        expiresAt: expiresAt,
      },
    });

    const requestor = await prisma.user.findUnique({
      where: { id: userId },
    });

    const notifications = [];

    // If bypassed, notify requester only
    if (hasBypassPermission) {
      notifications.push({
        userId: userId,
        type: "print_approved",
        title: "Print Request Auto-Approved",
        message: `Your request to print "${document.name}" has been automatically approved.`,
        documentId: document.id,
      });

      if (notifications.length > 0) {
        await createBulkNotifications(notifications);
      }

      return res.status(200).json({
        success: true,
        message: "Print request automatically approved.",
        status: "approved",
      });
    }

    // ========================================
    // UPDATED: Create digital_approval instead of print_approval
    // ========================================

    // Get QA users with Super Admin role for approval hierarchy
    const qaUsers = await prisma.user.findMany({
      where: {
        departments: {
          some: {
            isDeleted: false,
            department: {
              departmentCode: { contains: "QA" },
              isDeleted: false,
            },
          },
        },
        role: {
          name: { in: ["Super Admin", "SUPER_ADMIN"] },
        },
        isDeleted: false,
      },
      select: {
        id: true,
        fullName: true,
      },
    });

    console.log(`Found ${qaUsers.length} QA users for print approval.`);

    if (qaUsers.length === 0) {
      return res.status(500).json({
        success: false,
        message: "No QA users found for approval.",
      });
    }

    // Clean up old print approvals ONLY from expired or rejected print requests
    // Keep approvals for approved/completed print requests to maintain history
    const inactivePrintRequests = await prisma.print_request.findMany({
      where: {
        documentId: document.id,
        status: { in: ["rejected", "expired"] },
      },
      select: { id: true },
    });

    if (inactivePrintRequests.length > 0) {
      const inactiveIds = inactivePrintRequests.map((r) => r.id);
      
      await prisma.digital_approval.deleteMany({
        where: {
          documentId: document.id,
          type: "print",
          printRequestId: { in: inactiveIds },
        },
      });
    }

    // Create digital_approval records for each QA user (NO hierarchy needed for print)
    // Type: "print" - single-approval system: any QA user can approve
    const approvalRecords = qaUsers.map((user) => ({
      documentId: document.id,
      // hierarchyId: null - Not needed for print approvals
      approverId: user.id,
      level: 1,
      status: "pending",
      type: "print",
      createdBy: userId,
      printRequestId: printRequest.id,
      documentRevision: document.revision, // Use current document revision
    }));

    await prisma.digital_approval.createMany({
      data: approvalRecords,
    });

    // Notify QA users
    const qaNotifications = qaUsers.map((user) => ({
      userId: user.id,
      type: "print_approval_request",
      title: "Print Approval Request",
      message: `${requestor.fullName} needs approval to print "${document.name}" (${document.documentCode})`,
      documentId: document.id,
    }));

    // Notify requester
    qaNotifications.push({
      userId: userId,
      type: "print_request_sent",
      title: "Print Request Sent",
      message: `Your print request for "${document.name}" has been sent to QA for approval.`,
      documentId: document.id,
    });

    if (qaNotifications.length > 0) {
      await createBulkNotifications(qaNotifications);
    }

    // Get created approval records with their IDs for magic link
    const createdApprovals = await prisma.digital_approval.findMany({
      where: {
        documentId: document.id,
        printRequestId: printRequest.id,
        type: "print",
        status: "pending",
      },
      select: {
        id: true,
        approverId: true,
      },
    });

    // Send email notifications with magic links to QA users
    if (createdApprovals.length > 0) {
      const { notifyPrintRequest } = require("../../utils/notification.util");
      
      // Group approvals by approver to send one email per user
      const approverMap = new Map();
      createdApprovals.forEach((approval) => {
        if (!approverMap.has(approval.approverId)) {
          approverMap.set(approval.approverId, approval.id);
        }
      });

      // Send email to each QA approver with their first approval ID
      for (const [approverId, approvalId] of approverMap) {
        await notifyPrintRequest(
          document.id,
          document.name,
          [approverId],
          {
            documentCode: document.documentCode,
            requesterName: requestor.fullName,
            copies: parseInt(copies) || 1,
            printRequestId: approvalId, // Pass approval ID for magic link
          }
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: "Print request sent successfully. Waiting for QA approval.",
      status: "pending",
    });
  } catch (error) {
    console.error("Error requesting print:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to request print",
    });
  }
}

module.exports = requestPrintHandler;
