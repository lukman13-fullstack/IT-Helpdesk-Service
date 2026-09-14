const prisma = require("../../utils/prisma");
const googleDriveService = require("../../services/googleDrive.service");
const { addObsoleteWatermark } = require("../../services/pdfWatermark.service");
const {
  canViewAllDocuments,
  userBelongsToDepartment,
} = require("../../utils/authorization.util");
const path = require("path");

async function previewDocumentHistoryHandler(req, res) {
  try {
    const { historyId } = req.params;

    // Get history record
    const historyRecord = await prisma.document_history.findUnique({
      where: { id: parseInt(historyId) },
      include: {
        document: {
          select: {
            id: true,
            departmentId: true,
            documentCode: true,
            isDeleted: true,
            status: true,
          },
        },
      },
    });

    if (!historyRecord) {
      return res.status(404).json({
        success: false,
        message: "Document history not found",
      });
    }

    if (historyRecord.document.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Document has been deleted",
      });
    }

    // Check department access
    const hasViewAllAccess = canViewAllDocuments(req.user);
    if (!hasViewAllAccess) {
      const hasAccess = userBelongsToDepartment(
        req.user,
        historyRecord.document.departmentId
      );
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to preview this document history",
        });
      }
    }

    // Preview PDF version
    if (!historyRecord.googleDriveFileId) {
      return res.status(404).json({
        success: false,
        message: "Document file not found for this version",
      });
    }

    const fileId = historyRecord.googleDriveFileId;
    const ext = path.extname(historyRecord.filePath || "") || ".pdf";
    let fileName = `${historyRecord.document.documentCode}_v${historyRecord.version}.${historyRecord.revision}${ext}`;
    const mimeType = historyRecord.mimeType || "application/pdf";

    // Download file from Google Drive
    let fileBuffer = await googleDriveService.downloadFile(fileId);

    // Add OBSOLETE watermark for history (old revisions) PDF files
    if (mimeType === "application/pdf") {
      try {
        fileBuffer = await addObsoleteWatermark(fileBuffer);
        fileName = `OBSOLETE_${fileName}`;
      } catch (watermarkError) {
        console.error("Error adding OBSOLETE watermark to history doc:", watermarkError);
        // Continue without watermark if it fails
      }
    }

    // Set response headers for inline display
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.setHeader("Content-Length", fileBuffer.length);

    // Send file
    return res.send(fileBuffer);
  } catch (error) {
    console.error("Error previewing document history:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to preview document history",
    });
  }
}

module.exports = previewDocumentHistoryHandler;
