const prisma = require("../../utils/prisma");
const googleDriveService = require("../../services/googleDrive.service");
const {
  canViewAllDocuments,
  userBelongsToDepartment,
} = require("../../utils/authorization.util");

async function previewDocumentHandler(req, res) {
  try {
    const { id } = req.params;

    // Get document (Allow obsolete/deleted documents to be previewed as well)
    const document = await prisma.document.findUnique({
      where: {
        id: parseInt(id),
      },
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Check access permissions
    // If the document is published (shared), anyone can preview it.
    // If not published (draft, pending, etc.), enforce department/permission checks.
    if (!document.isPublished) {
      const hasViewAllAccess = canViewAllDocuments(req.user);
      if (!hasViewAllAccess) {
        const hasAccess = userBelongsToDepartment(
          req.user,
          document.departmentId
        );
        if (!hasAccess) {
          return res.status(403).json({
            success: false,
            message: "You don't have permission to preview this document",
          });
        }
      }
    }

    // Determine which file to preview
    // For draft/pending documents, prefer the latest generated file (googleDriveFileId).
    // For approved/published documents, prefer the master/final version.
    const isApprovedOrPublished = document.isPublished || document.status === "approved";
    const fileId = isApprovedOrPublished
      ? (document.googleDriveMasterVersionId ||
         document.googleDriveFinalFileId ||
         document.googleDriveFileId ||
         document.googleDriveControlledVersionId ||
         document.googleDriveUncontrolledVersionId)
      : (document.googleDriveFileId ||
         document.googleDriveMasterVersionId ||
         document.googleDriveFinalFileId ||
         document.googleDriveControlledVersionId ||
         document.googleDriveUncontrolledVersionId);

    if (!fileId) {
      return res.status(404).json({
        success: false,
        message: "No file available for preview",
      });
    }

    // Download file from Google Drive
    let fileBuffer = await googleDriveService.downloadFile(fileId);
    let mimeType = document.mimeType || "application/pdf";

    // If it's an obsolete document, add OBSOLETE watermark
    if (document.status === "obsolete" && mimeType === "application/pdf") {
      try {
        const { addObsoleteWatermark } = require("../../services/pdfWatermark.service");
        fileBuffer = await addObsoleteWatermark(fileBuffer);
      } catch (watermarkError) {
        console.error("Error adding OBSOLETE watermark during preview:", watermarkError);
        // Continue without watermark if it fails
      }
    }

    // Set response headers for inline display (preview in browser)
    const fileName = `${document.documentCode}_v${document.version}.${document.revision}.pdf`;
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.setHeader("Content-Length", fileBuffer.length);

    // Send file
    return res.send(fileBuffer);
  } catch (error) {
    console.error("Error previewing document:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to preview document",
    });
  }
}

module.exports = previewDocumentHandler;
