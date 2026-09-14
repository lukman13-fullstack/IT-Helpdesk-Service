const prisma = require("../../utils/prisma");
const googleDriveService = require("../../services/googleDrive.service");
const { addObsoleteWatermark } = require("../../services/pdfWatermark.service");

/**
 * Preview obsolete document handler (for in-browser viewing)
 * 
 * Permission: VIEW_OBSOLETE_DOCUMENTS
 * - Regular users: can only preview obsolete documents from their own departments
 * - QA department users: can preview obsolete documents from ALL departments
 */
async function previewObsoleteDocumentHandler(req, res) {
  try {
    const { id } = req.params;

    // Get user's departments
    const userDepartments = req.user.departments || [];
    const userDepartmentIds = userDepartments.map((dept) => dept.departmentId);

    // Check if user belongs to QA department
    const qaDepartment = await prisma.department.findFirst({
      where: {
        departmentCode: "QA",
        isDeleted: false,
      },
      select: { id: true },
    });

    const isQAUser = qaDepartment && userDepartmentIds.includes(qaDepartment.id);

    // Get obsolete document
    const document = await prisma.document.findFirst({
      where: {
        id: parseInt(id),
        isDeleted: true,
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

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Obsolete document not found",
      });
    }

    // Check authorization - QA can preview all, others only their departments
    if (!isQAUser) {
      const hasAccess = userDepartmentIds.includes(document.departmentId);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to preview this obsolete document",
        });
      }
    }

    // Get PDF file ID (prefer final/approved version)
    let fileId;
    if (document.googleDriveFinalFileId) {
      fileId = document.googleDriveFinalFileId;
    } else if (document.googleDriveFileId) {
      fileId = document.googleDriveFileId;
    } else {
      return res.status(404).json({
        success: false,
        message: "PDF file not available for preview",
      });
    }

    // Download file from Google Drive
    let fileBuffer = await googleDriveService.downloadFile(fileId);

    // Add OBSOLETE watermark for preview
    try {
      fileBuffer = await addObsoleteWatermark(fileBuffer);
    } catch (watermarkError) {
      console.error("Error adding OBSOLETE watermark:", watermarkError);
      // Continue without watermark if it fails
    }

    // Set response headers for inline display (preview)
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline"); // inline for preview
    res.setHeader("Content-Length", fileBuffer.length);

    // Send file
    return res.send(fileBuffer);
  } catch (error) {
    console.error("Error previewing obsolete document:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to preview obsolete document",
    });
  }
}

module.exports = previewObsoleteDocumentHandler;
