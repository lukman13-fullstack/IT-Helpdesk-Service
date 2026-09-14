const prisma = require("../../utils/prisma");
const googleDriveService = require("../../services/googleDrive.service");
const { addObsoleteWatermark } = require("../../services/pdfWatermark.service");
const {
  canViewAllDocuments,
  userBelongsToDepartment,
} = require("../../utils/authorization.util");
const path = require("path");

async function downloadDocumentHistoryHandler(req, res) {
  try {
    const { historyId } = req.params;
    const { type } = req.query; // 'master' or default (pdf)

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
          message: "You don't have permission to download this document",
        });
      }
    }

    // Determine which file to download
    let fileId, fileName, mimeType;

    if (type === "master") {
      if (!historyRecord.masterDocumentGoogleDriveId) {
        return res.status(404).json({
          success: false,
          message: "Master document not found for this version",
        });
      }

      const mimeToExt = {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
          ".docx",
        "application/msword": ".doc",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
          ".xlsx",
        "application/vnd.ms-excel": ".xls",
        "application/pdf": ".pdf",
      };

      fileId = historyRecord.masterDocumentGoogleDriveId;
      const originalExt = path.extname(historyRecord.masterDocumentPath || "");
      const ext =
        originalExt ||
        mimeToExt[historyRecord.masterDocumentMimeType] ||
        ".bin";

      fileName = `${historyRecord.document.documentCode}_master_v${historyRecord.version}.${historyRecord.revision}${ext}`;
      mimeType =
        historyRecord.masterDocumentMimeType || "application/octet-stream";
    } else {
      // Download PDF version
      if (!historyRecord.googleDriveFileId) {
        return res.status(404).json({
          success: false,
          message: "Document file not found for this version",
        });
      }

      fileId = historyRecord.googleDriveFileId;
      const ext = path.extname(historyRecord.filePath || "") || ".pdf";
      fileName = `${historyRecord.document.documentCode}_v${historyRecord.version}.${historyRecord.revision}${ext}`;
      mimeType = historyRecord.mimeType || "application/pdf";
    }

    // Download file from Google Drive
    let fileBuffer = await googleDriveService.downloadFile(fileId);

    // Add OBSOLETE watermark for history (old revisions) PDF files
    if (type !== "master" && mimeType === "application/pdf") {
      try {
        fileBuffer = await addObsoleteWatermark(fileBuffer);
        fileName = `OBSOLETE_${fileName}`;
      } catch (watermarkError) {
        console.error("Error adding OBSOLETE watermark to history doc:", watermarkError);
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
    console.error("Error downloading document history:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to download document history",
    });
  }
}

module.exports = downloadDocumentHistoryHandler;
