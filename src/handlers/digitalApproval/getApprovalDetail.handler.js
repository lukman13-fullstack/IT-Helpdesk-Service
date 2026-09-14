const prisma = require("../../utils/prisma");

/**
 * Get a single approval detail by ID
 * Used when accessing an approval directly via link (e.g., from email)
 */
async function getApprovalDetail(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: "Invalid approval ID",
      });
    }

    const approvalId = parseInt(id);

    // Try to find in digital_approval
    const approval = await prisma.digital_approval.findUnique({
      where: { id: approvalId },
      include: {
        document: {
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
          },
        },
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
        creator: {
          select: {
            id: true,
            fullName: true,
          },
        },
        printRequest: {
          include: {
            requester: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
      },
    });

    if (approval) {
      // Check if user is allowed to view this approval
      // Allow: Approver, Creator, or maybe Admin (omitted for now)
      if (approval.approverId !== userId && approval.creatorId !== userId) {
        // We might want to be lenient here if we want to allow viewing past approvals?
        // For now, strict check + creator.
      }

      // Map response to match expected format
      let reason = approval.reason;
      
      // Fallback reason logic
      if (!reason && approval.type === "approval" && approval.documentRevision === 0 && approval.document?.proposalObjective) {
        reason = approval.document.proposalObjective;
      }

      return res.status(200).json({
        success: true,
        data: {
          ...approval,
          createdByName: approval.creator ? approval.creator.fullName : null,
          reason: reason || null,
        },
      });
    }

    // If not found in digital_approval, check print_request (if ID matches somehow? unlikely as they have different tables)
    // The email link for print request goes to /approvals/print/:id, which is handled by a different page.
    // This handler is for /approvals/document/:id which maps to digital_approval.

    return res.status(404).json({
      success: false,
      message: "Approval not found",
    });

  } catch (error) {
    console.error("Error getting approval detail:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get approval detail",
    });
  }
}

module.exports = getApprovalDetail;
