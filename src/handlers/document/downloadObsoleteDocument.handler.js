const prisma = require("../../utils/prisma");
const googleDriveService = require("../../services/googleDrive.service");
const { addObsoleteWatermark } = require("../../services/pdfWatermark.service");
const path = require("path");

/**
 * Download obsolete document handler
 * 
 * Permission: DOWNLOAD_OBSOLETE_DOCUMENTS
 * - Regular users: can only download obsolete documents from their own departments
 * - QA department users: can download obsolete documents from ALL departments
 */
async function downloadObsoleteDocumentHandler(req, res) {
  try {
    const { id } = req.params;
    const { type } = req.query; // "master" for master document, default is PDF

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

    // Check authorization - QA can download all, others only their departments
    if (!isQAUser) {
      const hasAccess = userDepartmentIds.includes(document.departmentId);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to download this obsolete document",
        });
      }
    }

    let fileId;
    let fileName;
    let mimeType;

    if (type === "master") {
      // Download master document
      if (!document.masterDocumentGoogleDriveId) {
        return res.status(404).json({
          success: false,
          message: "Master document not available for this obsolete document",
        });
      }

      fileId = document.masterDocumentGoogleDriveId;
      const ext = document.masterDocumentMimeType
        ? path.extname(document.masterDocumentPath || "")
        : "";
      fileName = `OBSOLETE_${document.documentCode}_master_v${document.version}.${document.revision}${ext}`;
      mimeType = document.masterDocumentMimeType || "application/octet-stream";
    } else {
      // Download PDF (final if available, otherwise original)
      if (document.googleDriveFinalFileId) {
        fileId = document.googleDriveFinalFileId;
        fileName = `OBSOLETE_${document.documentCode}_v${document.version}.${document.revision}_APPROVED.pdf`;
      } else if (document.googleDriveFileId) {
        fileId = document.googleDriveFileId;
        fileName = `OBSOLETE_${document.documentCode}_v${document.version}.${document.revision}.pdf`;
      } else {
        return res.status(404).json({
          success: false,
          message: "PDF file not available for this obsolete document",
        });
      }
      mimeType = "application/pdf";
    }

    // Download file from Google Drive
    let fileBuffer = await googleDriveService.downloadFile(fileId);

    // Add OBSOLETE watermark for PDF files
    if (type !== "master" && mimeType === "application/pdf") {
      try {
        fileBuffer = await addObsoleteWatermark(fileBuffer);
      } catch (watermarkError) {
        console.error("Error adding OBSOLETE watermark:", watermarkError);
        // Continue without watermark if it fails
      }
    }

    // Set response headers
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", fileBuffer.length);

    // Send file
    return res.send(fileBuffer);
  } catch (error) {
    console.error("Error downloading obsolete document:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to download obsolete document",
    });
  }
}

module.exports = downloadObsoleteDocumentHandler;
