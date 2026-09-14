const prisma = require("../../utils/prisma");
const { isSuperAdmin } = require("../../utils/authorization.util");
const googleDriveService = require("../../services/googleDrive.service");
const wiExcelGenerator = require("../../services/wiExcelGenerator.service");
const {
  canViewAllDocuments,
  userBelongsToDepartment,
} = require("../../utils/authorization.util");
const path = require("path");

async function downloadDocumentHandler(req, res) {
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

    // Check department access
    const hasViewAllAccess = canViewAllDocuments(req.user);
    const hasDownloadPermission = req.user?.role?.permissions?.some(
      (rp) => rp.permission?.name === "DOWNLOAD_DOCUMENT"
    );

    if (!hasViewAllAccess) {
      let hasAccess = userBelongsToDepartment(
        req.user,
        document.departmentId
      );

      // Bypass department check if downloading a shared raw document that is explicitly downloadable
      if (!hasAccess && document.isPublished && req.query.type === "master" && document.isRawDownloadable) {
        hasAccess = true;
      }

      // Bypass department check if user has DOWNLOAD_DOCUMENT permission and is downloading master
      if (!hasAccess && hasDownloadPermission && req.query.type === "master") {
        hasAccess = true;
      }

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to download this document",
        });
      }
    }

    // Determine which file to download
    const { type, forceOriginal } = req.query;
    let fileId, fileName, mimeType;

    if (type === "master") {
      // If it's a Work Instruction document, generate a fresh Excel file on-the-fly to ensure no HTML leak for old files
      if (document.category === "instruksi_kerja" && forceOriginal !== "true" && forceOriginal !== true) {
        try {
          const template = await prisma.work_instruction_template.findFirst({
            where: { documentId: document.id, isActive: true },
          });
          
          if (template) {
            const templateData = typeof template.templateData === "string" 
              ? JSON.parse(template.templateData) 
              : template.templateData;
            
            const parsed = {
              topSections: templateData.topSections || [],
              instructionText: templateData.instructionText || "",
              sections: templateData.sections || [],
              attachments: templateData.attachments || [],
              pages: templateData.pages || [],
              style: typeof template.styleData === "string" 
                ? JSON.parse(template.styleData) 
                : template.styleData,
            };

            const excelBuffer = await wiExcelGenerator.generate(
              {
                documentCode: document.documentCode,
                name: document.name,
                releaseDate: document.releaseDate,
                revision: document.revision,
              },
              parsed
            );

            if (excelBuffer) {
              const revStr = String(document.revision).padStart(2, "0");
              const fileName = `${document.documentCode}_master_v${document.version}.${revStr}.xlsx`;
              
              res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
              res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
              res.setHeader("Content-Length", excelBuffer.length);
              return res.send(excelBuffer);
            }
          }
        } catch (genError) {
          console.error("Failed to generate fresh Excel on-the-fly, falling back to Drive:", genError);
        }
      }

      if (!document.googleDriveMasterVersionId && !document.masterDocumentGoogleDriveId) {
        return res.status(404).json({
          success: false,
          message: "Master document not found",
        });
      }
      
      // Prioritize original master document (Excel/Word/etc) as requested by user
      if (document.masterDocumentGoogleDriveId) {
        const mimeToExt = {
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
          "application/msword": ".doc",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
          "application/vnd.ms-excel": ".xls",
          "application/pdf": ".pdf",
        };

        fileId = document.masterDocumentGoogleDriveId;
        const originalExt = path.extname(document.masterDocumentPath || "");
        const ext = originalExt || mimeToExt[document.masterDocumentMimeType] || ".bin";
        fileName = `${document.documentCode}_master_v${document.version}.${document.revision}${ext}`;
        mimeType = document.masterDocumentMimeType || "application/octet-stream";
      } else {
        // Fallback to master watermark version (PDF) if original master ID is not found
        fileId = document.googleDriveMasterVersionId;
        fileName = `${document.documentCode}_v${document.version}.${document.revision}_MASTER.pdf`;
        mimeType = "application/pdf";
      }
    } else if (type === "controlled" || type === "uncontrolled") {
      // Direct access to watermarked versions for Super Admins
      if (!isSuperAdmin(req.user)) {
        return res.status(403).json({
          success: false,
          message: "Only Quality Assurance (Super Admin) can download watermarked versions directly.",
        });
      }

      if (type === "controlled") {
        if (!document.googleDriveControlledVersionId) {
          return res.status(404).json({
            success: false,
            message: "Controlled version not found.",
          });
        }
        fileId = document.googleDriveControlledVersionId;
        fileName = `${document.documentCode}_v${document.version}.${document.revision}_CONTROLLED.pdf`;
      } else {
        if (!document.googleDriveUncontrolledVersionId) {
          return res.status(404).json({
            success: false,
            message: "Uncontrolled version not found.",
          });
        }
        fileId = document.googleDriveUncontrolledVersionId;
        fileName = `${document.documentCode}_v${document.version}.${document.revision}_UNCONTROLLED.pdf`;
      }
      mimeType = "application/pdf";
    } else {
      // For approved documents, select version based on print request
      if (document.status === "approved") {
        const { printRequestId } = req.query;
        let printRequest = null;

        // If printRequestId specified, use that specific request
        if (printRequestId) {
          const { isExpired } = require("../../utils/workingDays.util");
          
          const printRequestWhere = {
            id: parseInt(printRequestId),
            documentId: parseInt(id),
            status: "approved",
          };
          
          // Non-super admin can only download their own
          if (!isSuperAdmin(req.user)) {
            printRequestWhere.requesterId = req.user.id;
          }

          printRequest = await prisma.print_request.findFirst({
            where: printRequestWhere,
          });

          // Check if expired
          if (
            printRequest &&
            printRequest.expiresAt &&
            isExpired(printRequest.expiresAt)
          ) {
            await prisma.print_request.update({
              where: { id: printRequest.id },
              data: { status: "expired" },
            });
            return res.status(400).json({
              success: false,
              message:
                "Print request has expired. Please request new print approval.",
            });
          }
        } else {
          // Fallback: find any approved print request for THIS user
          printRequest = await prisma.print_request.findFirst({
            where: {
              documentId: parseInt(id),
              requesterId: req.user.id,
              status: "approved",
            },
            orderBy: {
              approvedAt: "desc",
            },
          });
        }

        if (printRequest) {
          // If User IS Super Admin - download based on print type
          if (isSuperAdmin(req.user)) {
            if (printRequest.isInternal) {
              // Internal print → CONTROLLED version
              if (!document.googleDriveControlledVersionId) {
                return res.status(404).json({
                  success: false,
                  message: "Controlled version not found. Document may need re-approval.",
                });
              }
              fileId = document.googleDriveControlledVersionId;
              fileName = `${document.documentCode}_v${document.version}.${document.revision}_CONTROLLED.pdf`;
            } else {
              // External print → UNCONTROLLED version
              if (!document.googleDriveUncontrolledVersionId) {
                return res.status(404).json({
                  success: false,
                  message: "Uncontrolled version not found. Document may need re-approval.",
                });
              }
              fileId = document.googleDriveUncontrolledVersionId;
              fileName = `${document.documentCode}_v${document.version}.${document.revision}_UNCONTROLLED.pdf`;
            }
          } else {
            // Non-QA User - fallback to Master/Final if they have approved print request but not QA
            if (document.googleDriveMasterVersionId) {
              fileId = document.googleDriveMasterVersionId;
              fileName = `${document.documentCode}_v${document.version}.${document.revision}_MASTER.pdf`;
            } else if (document.googleDriveFinalFileId) {
              fileId = document.googleDriveFinalFileId;
              fileName = `${document.documentCode}_v${document.version}.${document.revision}.pdf`;
            } else {
              return res.status(403).json({
                success: false,
                message: "Only Quality Assurance (Super Admin) can print controlled documents.",
              });
            }
          }
        } else {
          // No print approval → MASTER version (view only)
          if (document.googleDriveMasterVersionId) {
            fileId = document.googleDriveMasterVersionId;
            fileName = `${document.documentCode}_v${document.version}.${document.revision}_MASTER.pdf`;
          } else if (document.googleDriveFinalFileId) {
            // Fallback for old documents without watermarked versions
            fileId = document.googleDriveFinalFileId;
            fileName = `${document.documentCode}_v${document.version}.${document.revision}.pdf`;
          } else {
            return res.status(403).json({
              success: false,
              message:
                "Print request approval required to download this document.",
            });
          }
        }
        mimeType = "application/pdf";
      } else {
        // Not approved → download original file
        fileId = document.googleDriveFileId;
        const ext = path.extname(document.filePath || "") || ".pdf";
        fileName = `${document.documentCode}_v${document.version}.${document.revision}${ext}`;
        mimeType = document.mimeType || "application/pdf";
      }
    }

    if (!fileId) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    // Download file from Google Drive
    const fileBuffer = await googleDriveService.downloadFile(fileId);

    // Set response headers
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", fileBuffer.length);

    // Send file
    return res.send(fileBuffer);
  } catch (error) {
    console.error("Error downloading document:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to download document",
    });
  }
}

module.exports = downloadDocumentHandler;
