const prisma = require("../../utils/prisma");
const { createNotification } = require("../../utils/notification.util");
const { getDocumentLevel } = require("../../utils/documentCode.util");
const { 
  finalizeDocumentApproval, 
  getHierarchyConfiguration, 
  createNextLevelApprovals 
} = require("../digitalApproval/approveDocument.handler");

/**
 * Approve a reference check for a document
 */
async function approveReferenceCheckHandler(req, res) {
  try {
    const { id } = req.params; // document_reference_link id
    const { comments } = req.body;
    const userId = req.user.id;

    console.log("Approving reference check:", id, "by user:", userId);

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
            departmentId: true, 
            category: true, 
            revision: true,
            version: true,
            googleDriveFileId: true,
            isInternal: true,
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

    console.log("Reference link found:", referenceLink);

    if (!referenceLink) {
      return res.status(404).json({
        success: false,
        message: "Reference check not found",
      });
    }

    // Verify user is the checker for this reference
    if (referenceLink.reference.checkerId !== userId) {
      console.log(
        "User not authorized. CheckerId:",
        referenceLink.reference.checkerId,
        "UserId:",
        userId
      );
      return res.status(403).json({
        success: false,
        message: "You are not authorized to approve this reference check",
      });
    }

    // Removed blocking hierarchy check to allow progressive flow (Reference -> Hierarchy)
    // even if a user exists in both roles.

    // Check status if column exists
    if (referenceLink.status && referenceLink.status !== "pending") {
      console.log(`Reference check already ${referenceLink.status}. ID: ${id}`);
      return res.status(200).json({
        success: true,
        message: `This reference check has already been ${referenceLink.status}`,
        data: referenceLink
      });
    }

    // Approve the reference check
    const updatedLink = await prisma.document_reference_link.update({
      where: { id: parseInt(id) },
      data: {
        status: "approved",
        comments: comments || null,
        checkedAt: new Date(),
        checkedBy: userId,
      },
    });

    console.log("Reference check approved:", updatedLink);

    // Notify document uploader
    // try {
    //   await createNotification({
    //     userId: referenceLink.document.uploadedBy,
    //     type: "reference_check_approved",
    //     title: "Reference Check Approved",
    //     message: `Your document "${referenceLink.document.name}" has passed the ${referenceLink.reference.name} (${referenceLink.reference.code}) check.`,
    //     documentId: referenceLink.document.id,
    //   });
    // } catch (notifError) {
    //   console.error("Failed to create notification:", notifError);
    //   // Don't fail the whole operation if notification fails
    // }

    // Send response EARLY to prevent timeout (Double-Click Bug)
    // The user has successfully performed THEIR action. Progression happens in background.
    res.json({
      success: true,
      message: "Reference check approved successfully",
      data: updatedLink,
    });

    // PROGRESSIVE APPROVAL: Check if ALL references FOR THIS REVISION are now approved
    // If so, create the next step approval records (runs in background)
    try {
      const allDocRefs = await prisma.document_reference_link.findMany({
        where: {
          documentId: referenceLink.document.id,
          documentRevision: referenceLink.documentRevision, // Only check refs for THIS revision
        },
      });
      const allRefsApproved = allDocRefs.every((r) => r.status === "approved");

      if (allRefsApproved) {
        console.log("All references approved, checking for next level approvals...");

        // Construct approval context for shared helpers
        const mockApprovalMock = {
          documentId: referenceLink.document.id,
          level: 1, 
          type: "approval", // Temporary
          documentRevision: referenceLink.documentRevision,
          document: {
            ...referenceLink.document,
            department: { id: referenceLink.document.departmentId }
          }
        };

        // 1. Get Hierarchy Config
        const { effectiveHierarchies, maxHierarchyLevel } = await getHierarchyConfiguration(mockApprovalMock);
        const nextLevel = 2; // QA is 1, so next is 2

        // 2. Identify Type (Approval or Revision)
        const existingApprovals = await prisma.digital_approval.findMany({
          where: {
            documentId: referenceLink.document.id,
            level: 1,
            documentRevision: referenceLink.documentRevision
          }
        });
        const approvalType = existingApprovals[0]?.type || "approval";
        const approvalCreatedBy = existingApprovals[0]?.createdBy || referenceLink.document.uploadedBy; // Fallback to uploadedBy just in case
        
        const mockApproval = { 
          ...mockApprovalMock, 
          type: approvalType,
          createdBy: approvalCreatedBy 
        };

        // 3. Create Level 2 if applicable
        if (nextLevel <= maxHierarchyLevel) {
          const hasLevel2 = await prisma.digital_approval.findFirst({
              where: {
                  documentId: referenceLink.document.id,
                  level: 2,
                  documentRevision: referenceLink.documentRevision,
                  type: approvalType
              }
          });

          if (!hasLevel2) {
              const level1Approval = existingApprovals.find(a => a.level === 1);
              
              await createNextLevelApprovals(
                  referenceLink.document.id,
                  nextLevel,
                  effectiveHierarchies,
                  approvalType,
                  approvalCreatedBy,
                  referenceLink.document.name,
                  referenceLink.documentRevision,
                  referenceLink.document.documentCode,
                  referenceLink.document.uploader?.fullName || "",
                  level1Approval?.reason || null,
                  referenceLink.document.category || "",
                  "", // departmentName (optional)
                  existingApprovals[0]?.batchId // Pass batchId for migration bypass
              );
          }
        }

        // 4. Update Document PDF and Status
        await finalizeDocumentApproval(mockApproval, userId, req.user);
      }
    } catch (bgError) {
      console.error("Background progression error:", bgError);
    }
  } catch (error) {
    console.error("Error approving reference check:", error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to approve reference check",
        error: error.message,
      });
    }
  }
}

module.exports = approveReferenceCheckHandler;
