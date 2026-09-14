const prisma = require("../../utils/prisma");
const googleDriveService = require("../../services/googleDrive.service");
const {
  canViewAllDocuments,
  userBelongsToDepartment,
} = require("../../utils/authorization.util");

async function printPreviewDocumentHandler(req, res) {
  try {
    const { id } = req.params;

    // Get document
    const document = await prisma.document.findFirst({
      where: {
        id: parseInt(id),
        isDeleted: false,
      },
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Check access permissions
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

    // Check if document is approved
    if (document.status !== "approved") {
      return res.status(400).json({
        success: false,
        message: "Only approved documents can be previewed for print",
      });
    }

    // Check for approved print request
    const printRequest = await prisma.print_request.findFirst({
      where: {
        documentId: parseInt(id),
        requesterId: req.user.id,
        status: "approved",
      },
      orderBy: {
        approvedAt: "desc",
      },
    });

    if (!printRequest) {
      return res.status(403).json({
        success: false,
        message: "Print request approval required to preview print version",
      });
    }

    // Determine which watermarked version to show based on print request type
    // Support both new 'distribution' field and old 'isInternal' field
    const isInternalRequest = printRequest.distribution 
      ? (printRequest.distribution === 'Internal')
      : printRequest.isInternal;
    
    let fileId;
    if (isInternalRequest) {
      // Internal print → show Controlled version
      fileId = document.googleDriveControlledVersionId;
    } else {
      // External print → show Uncontrolled version
      fileId = document.googleDriveUncontrolledVersionId;
    }

    if (!fileId) {
      return res.status(404).json({
        success: false,
        message:
          "Watermarked version not found. Document may need re-approval.",
      });
    }

    // Download file from Google Drive
    const fileBuffer = await googleDriveService.downloadFile(fileId);

    // Set response headers for inline display (preview in browser)
    const watermarkType = isInternalRequest
      ? "CONTROLLED"
      : "UNCONTROLLED";
    const fileName = `${document.documentCode}_v${document.version}.${document.revision}_${watermarkType}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.setHeader("Content-Length", fileBuffer.length);

    // Send file
    return res.send(fileBuffer);
  } catch (error) {
    console.error("Error previewing print document:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to preview print document",
    });
  }
}

module.exports = printPreviewDocumentHandler;
