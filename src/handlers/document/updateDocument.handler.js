const prisma = require("../../utils/prisma");
const {
  canViewAllDocuments,
  userBelongsToDepartment,
} = require("../../utils/authorization.util");
const googleDriveService = require("../../services/googleDrive.service");
const templateGeneratorService = require("../../services/templateGenerator.service");
const path = require("path");
const { generateDocumentCode } = require("../../utils/documentCode.util");
const { logUpdate } = require("../../utils/logger");
const { notifyApprovers, notifyReferenceCheckers } = require("../../utils/notification.util");

async function updateDocumentHandler(req, res) {
  try {
    const { id } = req.params;
    const { 
      name, 
      category, 
      isInternal, 
      proposalObjective,
      documentFormat,
      retentionPeriod,
      hardDocumentRetentionPeriod,
      storageLocation,
      hardDocumentStorageLocation,
      publishingInstitution,
      dateOfIssue,
      expiredDate,
      documentStoragePeriod,
      remark,
      destination,
      templateData,
      referenceIds
    } = req.body;

    const existingDocument = await prisma.document.findFirst({
      where: {
        id: parseInt(id),
        isDeleted: false,
      },
    });

    if (!existingDocument) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      }); 
    }

    const hasViewAllAccess = canViewAllDocuments(req.user);
    if (!hasViewAllAccess) {
      const hasAccess = userBelongsToDepartment(
        req.user,
        existingDocument.departmentId
      );
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to update this document",
        });
      }
    }

    const hasReferenceUpdate = referenceIds !== undefined;
    let parsedReferenceIds = [];
    if (hasReferenceUpdate) {
      try {
        parsedReferenceIds =
          typeof referenceIds === "string"
            ? JSON.parse(referenceIds)
            : referenceIds;
        if (!Array.isArray(parsedReferenceIds)) {
          parsedReferenceIds = [parsedReferenceIds];
        }
        parsedReferenceIds = parsedReferenceIds
          .map((id) => parseInt(id))
          .filter((id) => !isNaN(id));
      } catch (e) {
        console.log("Failed to parse referenceIds:", e);
        parsedReferenceIds = [];
      }
    }

    if (hasReferenceUpdate && (isInternal === "true" || isInternal === true || existingDocument.isInternal)) {
      const docCategory = category || existingDocument.category;
      if (docCategory === "manual_perusahaan" && parsedReferenceIds.length < 2) {
        return res.status(400).json({ success: false, message: "Manual Perusahaan documents require at least 2 document references" });
      }
      if (docCategory === "manual_halal" && parsedReferenceIds.length < 1) {
        return res.status(400).json({ success: false, message: "Manual Halal documents require at least 1 document reference" });
      }
    }

    // Only allow updates for draft or rejected documents
    if (existingDocument.status !== "draft" && existingDocument.status !== "rejected") {
      return res.status(400).json({
        success: false,
        message: "Only draft or rejected documents can be updated",
      });
    }

    const updateData = {};
    if (existingDocument.status === "rejected") {
      updateData.status = "draft";
    }
    if (name) updateData.name = name;
    if (category) updateData.category = category;
    if (isInternal !== undefined)
      updateData.isInternal = isInternal === "true" || isInternal === true;
    if (proposalObjective !== undefined)
      updateData.proposalObjective = proposalObjective;
    
    // Document format fields
    if (documentFormat !== undefined) updateData.documentFormat = documentFormat || null;
    if (retentionPeriod !== undefined) updateData.retentionPeriod = retentionPeriod || null;
    if (hardDocumentRetentionPeriod !== undefined) updateData.hardDocumentRetentionPeriod = hardDocumentRetentionPeriod || null;
    if (storageLocation !== undefined) updateData.storageLocation = storageLocation || null;
    if (remark !== undefined) updateData.remark = remark || null;
    
    // External document fields
    if (publishingInstitution !== undefined) updateData.publishingInstitution = publishingInstitution || null;
    if (dateOfIssue !== undefined) updateData.dateOfIssue = dateOfIssue ? new Date(dateOfIssue) : null;
    if (expiredDate !== undefined) updateData.expiredDate = expiredDate ? new Date(expiredDate) : null;
    if (documentStoragePeriod !== undefined) updateData.documentStoragePeriod = documentStoragePeriod ? parseInt(documentStoragePeriod) : null;
    if (hardDocumentStorageLocation !== undefined) updateData.hardDocumentStorageLocation = hardDocumentStorageLocation || null;

    // Handle destination change for QA users
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { departments: { include: { department: true } } }
    });
    const isQaUser = user.departments.some(ud => ud.department.departmentCode === "QA");

    if (isQaUser && destination !== undefined) {
      updateData.destination = destination || null;
      if (destination && (destination === "QA" || destination === "MR") && destination !== existingDocument.destination) {
        const targetDept = await prisma.department.findFirst({
          where: { departmentCode: destination, isDeleted: false }
        });
        if (targetDept) {
          updateData.departmentId = targetDept.id;
          // Trigger code regeneration with new department
          const { documentCode, documentNumber } = await generateDocumentCode(
            targetDept.id,
            category || existingDocument.category
          );
          updateData.documentCode = documentCode;
          updateData.documentNumber = documentNumber;
          existingDocument.documentCode = documentCode; // For file naming later
        }
      }
    }

    if (category && category !== existingDocument.category) {
      const { documentCode, documentNumber } = await generateDocumentCode(
        existingDocument.departmentId,
        category
      );
      updateData.documentCode = documentCode;
      updateData.documentNumber = documentNumber;
      existingDocument.documentCode = documentCode;
    }

    if (req.files && req.files["file"]) {
      const pdfFile = req.files["file"][0];
      const fileName = `${existingDocument.documentCode}_v${existingDocument.version}.${existingDocument.revision}.pdf`;

      const googleDriveFileId = await googleDriveService.uploadFile(
        pdfFile.buffer,
        fileName,
        pdfFile.mimetype
      );

      updateData.googleDriveFileId = googleDriveFileId;
      updateData.fileSize = pdfFile.size;
      updateData.mimeType = pdfFile.mimetype;
    }

    if (req.files && req.files["masterDocumentFile"]) {
      const masterFile = req.files["masterDocumentFile"][0];
      const masterFileName = `${existingDocument.documentCode}_master_v${
        existingDocument.version
      }.${existingDocument.revision}${path.extname(masterFile.originalname)}`;

      const masterDocumentGoogleDriveId = await googleDriveService.uploadFile(
        masterFile.buffer,
        masterFileName,
        masterFile.mimetype
      );

      updateData.masterDocumentGoogleDriveId = masterDocumentGoogleDriveId;
      updateData.masterDocumentFileSize = masterFile.size;
      updateData.masterDocumentMimeType = masterFile.mimetype;
      updateData.masterDocumentPath = masterFile.originalname;
    }

    const document = await prisma.document.update({
      where: { id: parseInt(id) },
      data: updateData,
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
    });

    // If document was explicitly rejected by an approver, restart the whole workflow (reset level 1, delete gt 1)
    if (existingDocument.status === "rejected") {
      await prisma.digital_approval.updateMany({
        where: {
          documentId: parseInt(id),
          level: 1,
          type: { in: ["approval", "revision"] },
          documentRevision: existingDocument.revision,
        },
        data: {
          status: "pending",
          approvedAt: null,
          approvedBy: null,
          comments: null,
        },
      });

      await prisma.digital_approval.deleteMany({
        where: {
          documentId: parseInt(id),
          level: { gt: 1 },
          type: { in: ["approval", "revision"] },
          documentRevision: existingDocument.revision,
        },
      });
    }

    // Always update references whether rejected or draft
    if (existingDocument.status === "rejected" || existingDocument.status === "draft") {
      if (hasReferenceUpdate) {
        const existingLinks = await prisma.document_reference_link.findMany({
          where: {
            documentId: parseInt(id),
            documentRevision: existingDocument.revision,
          },
        });
        const existingRefIds = existingLinks.map(l => l.referenceId);
        
        const toRemove = existingRefIds.filter(refId => !parsedReferenceIds.includes(refId));
        const toAdd = parsedReferenceIds.filter(refId => !existingRefIds.includes(refId));

        if (toRemove.length > 0) {
          await prisma.document_reference_link.deleteMany({
            where: {
              documentId: parseInt(id),
              documentRevision: existingDocument.revision,
              referenceId: { in: toRemove }
            }
          });
        }

        if (toAdd.length > 0) {
          const validReferences = await prisma.document_reference.findMany({
            where: { id: { in: toAdd }, isActive: true },
          });

          if (validReferences.length > 0) {
            await prisma.document_reference_link.createMany({
              data: validReferences.map((ref) => ({
                documentId: parseInt(id),
                referenceId: ref.id,
                status: "pending",
                documentRevision: existingDocument.revision,
              })),
              skipDuplicates: true,
            });
          }
        }
      } else {
        // Reset ONLY rejected references to pending so they can be re-reviewed
        await prisma.document_reference_link.updateMany({
          where: {
            documentId: parseInt(id),
            documentRevision: existingDocument.revision,
            status: "rejected"
          },
          data: {
            status: "pending",
            checkedAt: null,
            checkedBy: null,
            comments: null,
          },
        });
      }

      // If document status is draft, check if QA already approved. If so, directly notify reference checkers
      if (existingDocument.status === "draft") {
        const level1Approvals = await prisma.digital_approval.findMany({
          where: {
            documentId: parseInt(id),
            level: 1,
            type: { in: ["approval", "revision"] },
            documentRevision: existingDocument.revision,
          }
        });
        const allQaApproved = level1Approvals.length > 0 && level1Approvals.every(a => a.status === "approved");

        if (allQaApproved) {
          // Only notify pending reference checkers (newly added or reset from rejected)
          const pendingDocumentRefs = await prisma.document_reference_link.findMany({
            where: { 
              documentId: parseInt(id), 
              documentRevision: existingDocument.revision,
              status: "pending" 
            }
          });
          
          if (pendingDocumentRefs.length > 0) {
            const refs = await prisma.document_reference.findMany({
              where: { id: { in: pendingDocumentRefs.map(r => r.referenceId) } },
              include: { checker: true },
            });

            const checkerData = refs
              .filter((r) => r.checkerId)
              .map((r) => {
                const refLink = pendingDocumentRefs.find((dr) => dr.referenceId === r.id);
                return {
                  checkerId: r.checkerId,
                  referenceName: r.name,
                  referenceLinkId: refLink?.id,
                };
              });

            if (checkerData.length > 0) {
              const docForNotify = await prisma.document.findUnique({
                where: { id: parseInt(id) },
                include: { uploader: true }
              });
              
              await notifyReferenceCheckers(
                parseInt(id),
                docForNotify.name,
                checkerData,
                {
                  documentCode: docForNotify.documentCode || "",
                  uploaderName: docForNotify.uploader?.fullName || req.user.fullName || "",
                }
              );
            }
          }
        }
      }

      // Notify the level 1 approvers since the document is resubmitted
      // ONLY notify pending approvers (if they already approved, they shouldn't get an email)
      const pendingApprovals = await prisma.digital_approval.findMany({
        where: {
          documentId: parseInt(id),
          level: 1,
          status: "pending",
          type: { in: ["approval", "revision"] },
          documentRevision: existingDocument.revision,
        },
        select: {
          id: true,
          approverId: true,
        },
      });

      if (pendingApprovals.length > 0) {
        // We need document with uploader for notification
        const docForNotify = await prisma.document.findUnique({
          where: { id: parseInt(id) },
          include: {
            department: true,
            uploader: true,
          }
        });

        if (docForNotify) {
          for (const approval of pendingApprovals) {
            await notifyApprovers(
              docForNotify.id,
              docForNotify.name,
              docForNotify.category,
              docForNotify.revision,
              [approval.approverId],
              {
                documentCode: docForNotify.documentCode || "",
                departmentName: docForNotify.department?.name || "",
                uploaderName: docForNotify.uploader?.fullName || req.user.fullName || "",
                documentCategory: docForNotify.category || "",
                revisionNumber: docForNotify.revision || '00',
                level: 1,
                approvalId: approval.id,
              }
            );
          }
        }
      }
    }

    // Handle Work Instruction template data update
    if (existingDocument.category === "instruksi_kerja" && templateData) {
      try {
        const parsed = typeof templateData === "string" ? JSON.parse(templateData) : templateData;
        const contentPayload = {
          topSections: parsed.topSections || [],
          instructionText: parsed.instructionText || "",
          sections: parsed.sections || [],
          attachments: parsed.attachments || [],
          pages: parsed.pages || null,
        };

        // Upsert the active template record
        const existingTemplate = await prisma.work_instruction_template.findFirst({
          where: { documentId: parseInt(id), isActive: true },
        });

        if (existingTemplate) {
          await prisma.work_instruction_template.update({
            where: { id: existingTemplate.id },
            data: {
              templateData: contentPayload,
              styleData: parsed.style || null,
              sectionCount: contentPayload.sections.length,
              attachmentCount: contentPayload.attachments.length,
            },
          });
        } else {
          await prisma.work_instruction_template.create({
            data: {
              documentId: parseInt(id),
              version: existingDocument.version,
              revision: existingDocument.revision,
              templateData: contentPayload,
              styleData: parsed.style || null,
              sectionCount: contentPayload.sections.length,
              attachmentCount: contentPayload.attachments.length,
            },
          });
        }

        // Re-generate PDF/Excel from updated template
        const generatedFiles = await templateGeneratorService.generateFiles(
          {
            documentCode: document.documentCode || existingDocument.documentCode,
            name: document.name || existingDocument.name,
            releaseDate: new Date(),
            revision: existingDocument.revision,
          },
          parsed
        );

        // Upload regenerated PDF to Google Drive
        const revStr = String(existingDocument.revision).padStart(2, "0");
        const pdfFileName = `${existingDocument.documentCode}_v${existingDocument.version}.${revStr}.pdf`;
        const newGoogleDriveFileId = await googleDriveService.uploadFile(
          generatedFiles.pdfBuffer,
          pdfFileName,
          "application/pdf"
        );

        const updateData = {
          googleDriveFileId: newGoogleDriveFileId,
          fileSize: generatedFiles.pdfBuffer.length,
          mimeType: "application/pdf",
        };

        // Upload regenerated Excel master if available
        if (generatedFiles.excelBuffer) {
          const xlsxFileName = `${existingDocument.documentCode}_master_v${existingDocument.version}.${revStr}.xlsx`;
          const newMasterGoogleDriveId = await googleDriveService.uploadFile(
            generatedFiles.excelBuffer,
            xlsxFileName,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          );
          updateData.masterDocumentGoogleDriveId = newMasterGoogleDriveId;
          updateData.masterDocumentFileSize = generatedFiles.excelBuffer.length;
          updateData.masterDocumentMimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
          updateData.masterDocumentPath = xlsxFileName;
        }

        await prisma.document.update({
          where: { id: parseInt(id) },
          data: updateData,
        });
      } catch (templateError) {
        console.error("Error updating template data:", templateError);
        // Non-fatal: document update still succeeds, template update logged as error
      }
    }

    // Log document update
    await logUpdate(
      "document",
      req.user.id,
      req.user.fullName,
      document.id,
      {
        name: existingDocument.name,
        category: existingDocument.category,
      },
      {
        name: document.name,
        category: document.category,
        documentCode: document.documentCode,
        departmentName: document.department.name,
      },
      `Updated document ${document.documentCode}`,
      document.departmentId
    );

    // Fetch the final document state to ensure all background updates (like masterDocumentGoogleDriveId) are included
    const finalDocument = await prisma.document.findUnique({
      where: { id: parseInt(id) },
      include: {
        department: { select: { id: true, name: true, departmentCode: true } },
        uploader: { select: { id: true, fullName: true, email: true } },
      },
    });

    return res.status(200).json({
      success: true,
      message: "Document updated successfully",
      data: finalDocument,
    });
  } catch (error) {
    console.error("Error updating document:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update document",
    });
  }
}

module.exports = updateDocumentHandler;
