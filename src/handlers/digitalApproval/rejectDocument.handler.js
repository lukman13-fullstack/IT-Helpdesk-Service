const prisma = require("../../utils/prisma");
const { createLog } = require("../../utils/logger");
const { notifyDocumentRejected } = require("../../utils/notification.util");

async function rejectDocument(req, res) {
  try {
    const { id } = req.params;
    const { comments } = req.body;
    const userId = req.user.id;

    if (!comments || comments.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Rejection comments are required",
      });
    }

    const approval = await prisma.digital_approval.findUnique({
      where: { id: parseInt(id) },
      include: {
        document: true,
      },
    });

    if (!approval) {
      return res.status(404).json({
        success: false,
        message: "Approval request not found",
      });
    }

    if (approval.approverId !== userId) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to reject this document",
      });
    }

    if (approval.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `This approval has already been ${approval.status}`,
      });
    }

    await prisma.digital_approval.update({
      where: { id: parseInt(id) },
      data: {
        status: "rejected",
        comments,
        approvedAt: new Date(),
        approvedBy: userId,
      },
    });

    // Handle print rejection
    if (approval.type === "print") {
      if (!approval.printRequestId) {
        return res.status(500).json({
          success: false,
          message: "Print request ID missing",
        });
      }

      // Cancel all other pending print approvals
      await prisma.digital_approval.updateMany({
        where: {
          printRequestId: approval.printRequestId,
          status: "pending",
          id: { not: parseInt(id) },
        },
        data: {
          status: "cancelled",
          comments: "Cancelled - rejected by QA",
        },
      });

      // Update print_request to rejected
      const printRequest = await prisma.print_request.update({
        where: { id: approval.printRequestId },
        data: { status: "rejected" },
        include: {
          document: true,
          requester: true,
        },
      });

      // Notify requester
      await prisma.notification.create({
        data: {
          userId: printRequest.requesterId,
          type: "print_rejected",
          title: "Print Request Rejected",
          message: `Your print request for "${printRequest.document.name}" was rejected. Reason: ${comments}`,
          documentId: printRequest.documentId,
        },
      });

      await createLog({
        userId,
        action: "REJECT_PRINT",
        entityType: "PRINT_REQUEST",
        entityId: printRequest.id,
        details: `Rejected print request for ${printRequest.document.name}. Reason: ${comments}`,
      });

      return res.status(200).json({
        success: true,
        message: "Print request rejected successfully",
      });
    }

    // Update remaining pending approvals to rejected
    await prisma.digital_approval.updateMany({
      where: {
        documentId: approval.document.id,
        status: "pending",
      },
      data: {
        status: "rejected",
      },
    });

    const updatedDocument = await prisma.document.update({
      where: { id: approval.document.id },
      data: {
        status:
          approval.type === "deletion" ? approval.document.status : "rejected",
      },
    });

    // Send notification for deletion rejection
    if (approval.type === "deletion") {
      await prisma.notification.create({
        data: {
          userId: approval.document.uploadedBy,
          type: "deletion_rejected",
          title: "Document Deletion Rejected",
          message: `Deletion request for document "${approval.document.documentCode}" has been rejected. Reason: ${comments}`,
          documentId: approval.document.id,
        },
      });
    }

    // Handle regular document rejection
    if (approval.type === "approval") {
      const approver = await prisma.user.findUnique({
        where: { id: userId },
        select: { fullName: true },
      });

      await notifyDocumentRejected(
        approval.document.id,
        approval.document.name,
        approval.document.uploadedBy,
        approver.fullName,
        comments,
        {
          documentCode: approval.document.documentCode,
        }
      );
    }

    // Fetch department info for logging
    const documentWithDept = await prisma.document.findUnique({
      where: { id: approval.document.id },
      include: { department: { select: { name: true } } },
    });

    // Log rejection action
    await createLog({
      action: approval.type === "deletion" ? "REJECT_DELETION" : "REJECT",
      table: "document",
      userId: req.user.id,
      description: `User ${req.user.fullName} menolak ${
        approval.type === "deletion" ? "penghapusan" : "approval"
      } document ${approval.document.documentCode} - ${
        approval.document.name
      } di level ${approval.level} untuk departemen ${
        documentWithDept.department.name
      }. Alasan: ${comments}`,
      departmentId: approval.document.departmentId,
    });

    return res.status(200).json({
      success: true,
      message: "Document rejected successfully",
      data: {
        approval,
        document: updatedDocument,
      },
    });
  } catch (error) {
    console.error("Error rejecting document:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to reject document",
    });
  }
}

module.exports = rejectDocument;
