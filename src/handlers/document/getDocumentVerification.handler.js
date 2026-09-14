const prisma = require("../../utils/prisma");

/**
 * Handler to get document verification data
 * This is a PUBLIC endpoint - no auth required
 * Used for QR code scanning
 */
async function getDocumentVerificationHandler(req, res) {
  try {
    const { id } = req.params;

    const document = await prisma.document.findUnique({
      where: {
        id: parseInt(id),
        isDeleted: false,
      },
      select: {
        id: true,
        name: true,
        documentCode: true,
        version: true,
        revision: true,
        status: true,
        releaseDate: true,
        category: true,
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
          },
        },
        approvals: {
          where: {
            type: "approval",
          },
          orderBy: {
            level: "asc",
          },
          select: {
            level: true,
            status: true,
            approvedAt: true,
            approver: {
              select: {
                fullName: true,
                role: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Format the verification data
    const verificationData = {
      companyName: "PT. TOYO INK INDONESIA",
      documentName: document.name,
      documentNumber: document.documentCode,
      numberRevision: document.revision.toString().padStart(2, "0"),
      effectiveDate: document.releaseDate
        ? new Date(document.releaseDate).toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })
        : "-",
      statusDocument: document.status === "approved" ? "Approved" : document.status,
      version: `${document.version}.${document.revision}`,
      department: document.department?.name || "-",
      category: formatCategory(document.category),
      uploadedBy: document.uploader?.fullName || "-",
      approvals: document.approvals.map((approval) => ({
        level: approval.level,
        approver: approval.approver.fullName,
        role: approval.approver.role?.name || "-",
        status: approval.status,
        approvedAt: approval.approvedAt
          ? new Date(approval.approvedAt).toLocaleDateString("id-ID", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })
          : "-",
      })),
    };

    return res.status(200).json({
      success: true,
      data: verificationData,
    });
  } catch (error) {
    console.error("Error getting document verification:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get document verification",
    });
  }
}

/**
 * Format category name for display
 */
function formatCategory(category) {
  const categoryMap = {
    form: "Form Document",
    standard: "Standard Document",
    instruksi_kerja: "Instruksi Kerja Document",
    prosedur: "Prosedur Document",
    manual_perusahaan: "Manual Perusahaan Document",
    manual_halal: "Manual Halal Document",
  };
  return categoryMap[category] || category;
}

module.exports = getDocumentVerificationHandler;
