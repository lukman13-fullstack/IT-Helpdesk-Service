const prisma = require("../../utils/prisma");
const { createNotification, notifyDocumentRejected } = require("../../utils/notification.util");

/**
 * Reject a reference check for a document
 */
async function rejectReferenceCheckHandler(req, res) {
  try {
    const { id } = req.params; // document_reference_link id
    const { comments } = req.body;
    const userId = req.user.id;

    // Validate comments are required for rejection
    if (!comments || comments.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Comments are required when rejecting a reference check",
      });
    }

    // Find the reference link
    const referenceLink = await prisma.document_reference_link.findUnique({
      where: { id: parseInt(id) },
      include: {
        document: {
          select: {
            id: true,
            name: true,
            documentCode: true,
            uploadedBy: true,
            uploader: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
        reference: {
          select: {
            id: true,
            name: true,
            code: true,
            checkerId: true,
          },
        },
      },
    });

    if (!referenceLink) {
      return res.status(404).json({
        success: false,
        message: "Reference check not found",
      });
    }

    // Verify user is the checker for this reference
    if (referenceLink.reference.checkerId !== userId) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to reject this reference check",
      });
    }

    // Check if this user has a pending hierarchy approval for this document
    // User must complete their hierarchy approval first before rejecting reference check
    const pendingHierarchyApproval = await prisma.digital_approval.findFirst({
      where: {
        documentId: referenceLink.document.id,
        approverId: userId,
        type: "approval",
        status: "pending",
      },
    });

    if (pendingHierarchyApproval) {
      return res.status(400).json({
        success: false,
        message: "Please complete your document hierarchy approval first before rejecting the reference check",
      });
    }

    // Check status
    if (referenceLink.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `This reference check has already been ${referenceLink.status}`,
      });
    }

    // Reject the reference check
    const updatedLink = await prisma.document_reference_link.update({
      where: { id: parseInt(id) },
      data: {
        status: "rejected",
        comments,
        checkedAt: new Date(),
        checkedBy: userId,
      },
    });

    // Notify document uploader (System & Email)
    const approver = await prisma.user.findUnique({
        where: { id: userId },
        select: { fullName: true },
    });

    const rejectionReason = `Reference Check Failed (${referenceLink.reference.name}): ${comments}`;

    await notifyDocumentRejected(
        referenceLink.document.id,
        referenceLink.document.name,
        referenceLink.document.uploadedBy,
        approver.fullName,
        rejectionReason,
        {
          documentCode: referenceLink.document.documentCode,
        }
    );


    return res.json({
      success: true,
      message: "Reference check rejected",
      data: updatedLink,
    });
  } catch (error) {
    console.error("Error rejecting reference check:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to reject reference check",
    });
  }
}

module.exports = rejectReferenceCheckHandler;
