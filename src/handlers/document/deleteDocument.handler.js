const prisma = require("../../utils/prisma");
const googleDriveService = require("../../services/googleDrive.service");
const {
  canViewAllDocuments,
  userBelongsToDepartment,
} = require("../../utils/authorization.util");
const { createLog } = require("../../utils/logger");

async function deleteDocumentHandler(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    // Check if document exists
    const existingDocument = await prisma.document.findFirst({
      where: {
        id: parseInt(id),
        isDeleted: false,
      },
      include: {
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!existingDocument) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Check if there is already a pending deletion request
    const pendingDeletion = await prisma.digital_approval.findFirst({
      where: {
        documentId: parseInt(id),
        type: "deletion",
        status: "pending",
      },
    });

    if (pendingDeletion) {
      return res.status(400).json({
        success: false,
        message: "A deletion request for this document is already pending approval",
      });
    }

    // If document is approved or has been approved before (revision > 0), require QA approval
    if (existingDocument.status === "approved" || existingDocument.revision > 0) {
      // Get QA department users (Same logic as Revision/Registration)
      const qaDepartments = await prisma.department.findMany({
        where: {
          departmentCode: "QA", // Strict match for QA department
          isDeleted: false,
        },
        include: {
          users: {
            where: { isDeleted: false },
            include: { user: { include: { role: true } } },
          },
        },
      });

      const qaUsers = [];
      qaDepartments.forEach((qaDept) => {
        qaDept.users.forEach((ud) => {
          const username = ud.user.username?.toLowerCase() || "";
          const fullName = ud.user.fullName?.toLowerCase() || "";
          if (
            !ud.user.isDeleted &&
            ud.user.role?.name === "SUPER_ADMIN" &&
            username !== "admin" &&
            fullName !== "admin" &&
            !qaUsers.find((u) => u.id === ud.user.id)
          ) {
            qaUsers.push(ud.user);
          }
        });
      });

      if (qaUsers.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No QA department users with 'SUPER_ADMIN' role found for checking deletion request.",
        });
      }

      if (!reason || reason.trim() === "") {
        return res.status(400).json({
          success: false,
          message: "Reason is required for deleting approved or revised documents",
        });
      }

      // Create Level 1 Approvals (Progressive Flow start)
      const approvalRecords = qaUsers.map((qaUser) => ({
        documentId: parseInt(id),
        hierarchyId: null,
        approverId: qaUser.id,
        level: 1,
        type: "deletion",
        status: "pending",
        documentRevision: existingDocument.revision || 0,
        reason: reason,
        createdBy: req.user.id,
      }));

      await prisma.digital_approval.createMany({
        data: approvalRecords,
      });

      // Get created approval records with their IDs for magic link
      const createdApprovals = await prisma.digital_approval.findMany({
        where: {
          documentId: parseInt(id),
          type: "deletion",
          status: "pending",
          level: 1, // Only notify level 1 first
        },
        select: {
          id: true,
          approverId: true,
        },
      });

      // Send email notifications with magic links
      if (createdApprovals.length > 0) {
        const { notifyDeletionRequest } = require("../../utils/notification.util");
        
        // Group approvals by approver to send one email per user
        const approverMap = new Map();
        createdApprovals.forEach((approval) => {
          if (!approverMap.has(approval.approverId)) {
            approverMap.set(approval.approverId, approval.id);
          }
        });

        // Send email to each approver with their first approval ID
        for (const [approverId, approvalId] of approverMap) {
          try {
            await notifyDeletionRequest(
              parseInt(id),
              existingDocument.name,
              [approverId],
              {
                documentCode: existingDocument.documentCode,
                requesterName: req.user.fullName,
                reason: reason || "",
                approvalId, // Pass approval ID for magic link
              }
            );
          } catch (e) {
            console.error(`[DELETE] Failed to notify approver ${approverId}:`, e.message);
          }
        }
      }

      return res.status(200).json({
        success: true,
        message: "Deletion approval request submitted to all QA departments",
      });
    }
    // Soft Delete: Rename files in Google Drive
    const fileIds = [
      { id: existingDocument.googleDriveFileId, name: "main" },
      { id: existingDocument.masterDocumentGoogleDriveId, name: "master" },
      { id: existingDocument.googleDriveFinalFileId, name: "final" }
    ].filter(f => f.id);

    for (const fileItem of fileIds) {
      try {
        const metadata = await googleDriveService.getFileMetadata(fileItem.id);
        if (!metadata.name.startsWith("OBSOLETE_")) {
          await googleDriveService.renameFile(fileItem.id, `OBSOLETE_${metadata.name}`);
        }
      } catch (error) {
        console.error(`Failed to rename ${fileItem.name} file ${fileItem.id}: ${error.message}`);
      }
    }

    // Update document to obsolete status
    await prisma.document.update({
      where: { id: parseInt(id) },
      data: {
        isDeleted: true,
        status: "obsolete",
        isPublished: false,
        deletionReason: reason || "Draft deleted by user"
      }
    });

    // Log document deletion
    await createLog({
      action: "DELETE",
      table: "document",
      userId: req.user.id,
      description: `User ${req.user.fullName} marked document ${existingDocument.documentCode} - ${existingDocument.name} v${existingDocument.version}.${existingDocument.revision} as OBSOLETE (Soft Delete)`,
      departmentId: existingDocument.departmentId,
    });

    return res.status(200).json({
      success: true,
      message: "Document marked as obsolete",
    });
  } catch (error) {
    console.error("Error deleting document:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete document",
    });
  }
}

module.exports = deleteDocumentHandler;
