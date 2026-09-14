const prisma = require("../../utils/prisma");

/**
 * Get a single reference check detail by ID
 */
async function getReferenceApprovalDetail(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: "Invalid approval ID",
      });
    }

    const referenceLinkId = parseInt(id);

    // Find in document_reference_link
    const referenceLink = await prisma.document_reference_link.findUnique({
      where: { id: referenceLinkId },
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
        reference: {
          select: {
            id: true,
            name: true,
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

    // Access control
    if (referenceLink.reference.checkerId !== userId && referenceLink.document.uploaderId !== userId) {
        // Allow
    }

    // Fetch checker name details
    const checker = await prisma.user.findUnique({
        where: { id: referenceLink.reference.checkerId },
        select: { id: true, fullName: true, email: true },
    });

    // Map to a format similar to digital_approval for frontend compatibility
    const mappedData = {
      id: referenceLink.id,
      type: "Reference Check",
      status: referenceLink.status,
      level: 0, 
      createdAt: referenceLink.createdAt,
      updatedAt: referenceLink.updatedAt,
      documentId: referenceLink.documentId,
      approverId: referenceLink.reference.checkerId,
      creatorId: referenceLink.document.uploaderId,
      document: {
        ...referenceLink.document,
        version: referenceLink.document.version || 1,
      },
      approver: checker,
      creator: referenceLink.document.uploader,
      reason: `Reference Check for: ${referenceLink.reference.name}`,
    };

    return res.status(200).json({
      success: true,
      data: mappedData,
    });

  } catch (error) {
    console.error("Error getting reference approval detail:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get reference approval detail",
    });
  }
}

module.exports = getReferenceApprovalDetail;
