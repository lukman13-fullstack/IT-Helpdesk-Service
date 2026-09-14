const prisma = require("../../utils/prisma");
const { createBulkNotifications } = require("../../utils/notification.util");
const {
  canBypassApproval,
  canViewAllDocuments,
  userBelongsToDepartment,
} = require("../../utils/authorization.util");
const {
  calculateExpiryDate,
  isExpired,
} = require("../../utils/workingDays.util");

/**
 * Bulk Request Print Handler
 * Allows users to request print for multiple documents at once
 */
async function bulkRequestPrintHandler(req, res) {
  try {
    const userId = req.user.id;
    const {
      documentIds,
      reason,
      copies,
      storageLocation,
      isInternal,
      distribution,
    } = req.body;

    // Validate input
    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one document.",
      });
    }

    // Limit bulk operations to 50 documents max
    if (documentIds.length > 50) {
      return res.status(400).json({
        success: false,
        message: "Maximum 50 documents can be processed at once.",
      });
    }

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

    // Fetch all documents
    const documents = await prisma.document.findMany({
      where: {
        id: { in: documentIds.map((id) => parseInt(id)) },
        status: "approved", // Only approved documents can be printed
      },
      include: {
        department: true,
      },
    });

    if (documents.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No approved documents found with the provided IDs.",
      });
    }

    // Check user permissions for each document
    const hasViewAllAccess = canViewAllDocuments(req.user);
    const accessibleDocuments = [];
    const inaccessibleDocuments = [];

    for (const document of documents) {
      if (hasViewAllAccess) {
        accessibleDocuments.push(document);
      } else {
        const hasDepartmentAccess = userBelongsToDepartment(
          req.user,
          document.departmentId
        );
        if (hasDepartmentAccess) {
          accessibleDocuments.push(document);
        } else {
          inaccessibleDocuments.push(document.name);
        }
      }
    }

    if (accessibleDocuments.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to request print for any of the selected documents.",
      });
    }

    const hasBypassPermission = canBypassApproval(req.user);
    const requestor = await prisma.user.findUnique({
      where: { id: userId },
    });

    // Get QA users for approval (only needed if not bypassing)
    let qaUsers = [];
    if (!hasBypassPermission) {
      qaUsers = await prisma.user.findMany({
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

      if (qaUsers.length === 0) {
        return res.status(500).json({
          success: false,
          message: "No QA users found for approval.",
        });
      }
    }

    const results = {
      success: [],
      failed: [],
      skipped: [],
    };

    const notifications = [];

    // Process each document
    for (const document of accessibleDocuments) {
      try {
        // Check existing PENDING requests for this document (only pending blocks new requests)
        const existingRequests = await prisma.print_request.findMany({
          where: {
            documentId: document.id,
            requesterId: userId,
            status: "pending", // Only pending requests block new ones, approved requests don't block
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

        // Re-fetch active PENDING requests (only pending blocks new requests)
        const activeRequests = await prisma.print_request.findMany({
          where: {
            documentId: document.id,
            requesterId: userId,
            status: "pending", // Only pending requests block new ones
          },
        });

        // Check for duplicate requests
        const hasInternalActive = activeRequests.some(
          (r) => r.distribution === "Internal" || r.isInternal === true
        );
        const hasExternalActive = activeRequests.some(
          (r) => r.distribution === "External" || r.isInternal === false
        );

        if (requestedType && hasInternalActive) {
          results.skipped.push({
            documentId: document.id,
            documentName: document.name,
            reason: "Already has active Internal print request",
          });
          continue;
        }

        if (!requestedType && hasExternalActive) {
          results.skipped.push({
            documentId: document.id,
            documentName: document.name,
            reason: "Already has active External print request",
          });
          continue;
        }

        // Calculate expiry if bypass
        const approvedAt = hasBypassPermission ? new Date() : null;
        const expiresAt = hasBypassPermission
          ? calculateExpiryDate(approvedAt)
          : null;

        // Create print_request
        const printRequest = await prisma.print_request.create({
          data: {
            documentId: document.id,
            requesterId: userId,
            status: hasBypassPermission ? "approved" : "pending",
            reason: reason || "Bulk print request",
            copies: parseInt(copies) || 1,
            distribution: finalDistribution,
            storageLocation: storageLocation || "Not specified",
            isInternal: requestedType,
            approvedBy: hasBypassPermission ? userId : null,
            approvedAt: approvedAt,
            expiresAt: expiresAt,
          },
        });

        if (hasBypassPermission) {
          // Auto-approved
          notifications.push({
            userId: userId,
            type: "print_approved",
            title: "Print Request Auto-Approved",
            message: `Your request to print "${document.name}" has been automatically approved.`,
            documentId: document.id,
          });
        } else {
          // Clean up any existing print approvals for this document
          // This prevents unique constraint violations
          await prisma.digital_approval.deleteMany({
            where: {
              documentId: document.id,
              type: "print",
            },
          });

          // Create digital_approval for QA users
          const approvalRecords = qaUsers.map((user) => ({
            documentId: document.id,
            approverId: user.id,
            level: 1,
            status: "pending",
            type: "print",
            createdBy: userId,
            printRequestId: printRequest.id,
            documentRevision: document.revision,
          }));

          await prisma.digital_approval.createMany({
            data: approvalRecords,
          });

          // Add QA notifications (only once per QA user, not per document)
          // We'll collect and dedupe later
        }

        results.success.push({
          documentId: document.id,
          documentName: document.name,
          documentCode: document.documentCode,
          printRequestId: printRequest.id,
          status: hasBypassPermission ? "approved" : "pending",
        });
      } catch (docError) {
        console.error(`Error processing document ${document.id}:`, docError);
        results.failed.push({
          documentId: document.id,
          documentName: document.name,
          reason: docError.message,
        });
      }
    }

    // If not bypassed, send notifications to QA users (summarized)
    if (!hasBypassPermission && results.success.length > 0) {
      const successCount = results.success.length;
      const documentNames = results.success
        .slice(0, 3)
        .map((d) => d.documentName)
        .join(", ");
      const moreText =
        successCount > 3 ? ` and ${successCount - 3} more` : "";

      // Notify QA users
      for (const qaUser of qaUsers) {
        notifications.push({
          userId: qaUser.id,
          type: "print_approval_request",
          title: "Bulk Print Approval Request",
          message: `${requestor.fullName} needs approval to print ${successCount} document(s): ${documentNames}${moreText}`,
          documentId: results.success[0].documentId, // Link to first document
        });
      }

      // Notify requester
      notifications.push({
        userId: userId,
        type: "print_request_sent",
        title: "Bulk Print Request Sent",
        message: `Your bulk print request for ${successCount} document(s) has been sent to QA for approval.`,
        documentId: results.success[0].documentId,
      });
    }

    // Send all notifications
    if (notifications.length > 0) {
      await createBulkNotifications(notifications);
    }

    // Build response message
    let message = "";
    if (results.success.length > 0) {
      if (hasBypassPermission) {
        message = `${results.success.length} print request(s) automatically approved.`;
      } else {
        message = `${results.success.length} print request(s) sent for approval.`;
      }
    }
    if (results.skipped.length > 0) {
      message += ` ${results.skipped.length} skipped (already have active requests).`;
    }
    if (results.failed.length > 0) {
      message += ` ${results.failed.length} failed.`;
    }
    if (inaccessibleDocuments.length > 0) {
      message += ` ${inaccessibleDocuments.length} document(s) skipped due to permission.`;
    }

    return res.status(200).json({
      success: true,
      message: message.trim(),
      data: results,
    });
  } catch (error) {
    console.error("Error in bulk request print:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process bulk print request",
    });
  }
}

module.exports = bulkRequestPrintHandler;
