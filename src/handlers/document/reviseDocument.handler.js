const prisma = require("../../utils/prisma");
const googleDriveService = require("../../services/googleDrive.service");
const {
  canViewAllDocuments,
  userBelongsToDepartment,
} = require("../../utils/authorization.util");
const { getDocumentLevel } = require("../../utils/documentCode.util");
const { notifyApprovers } = require("../../utils/notification.util");
const templateGeneratorService = require("../../services/templateGenerator.service");
const path = require("path");
const { createLog } = require("../../utils/logger");

async function reviseDocumentHandler(req, res) {
  try {
    const { id } = req.params;
    const { 
      name,
      changeDescription, 
      revisionPurpose, 
      documentFormat, 
      retentionPeriod, 
      storageLocation, 
      remark,
      templateData,
      publishingInstitution,
      dateOfIssue,
      expiredDate,
      referenceIds
    } = req.body;
    const changedBy = req.user.id;

    // Validate file upload — skip for instruksi_kerja and external documents
    const existingDocForCheck = await prisma.document.findFirst({
      where: { id: parseInt(id), isDeleted: false },
      select: { category: true, isInternal: true },
    });

    const isWorkInstruction = existingDocForCheck?.category === "instruksi_kerja";
    const isInternal = existingDocForCheck?.isInternal;

    if (isInternal && !isWorkInstruction && (!req.files || !req.files["file"])) {
      return res.status(400).json({
        success: false,
        message: "PDF file is required for revision for internal documents",
      });
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

    if (hasReferenceUpdate && isInternal) {
      if (existingDocForCheck.category === "manual_perusahaan" && parsedReferenceIds.length < 2) {
        return res.status(400).json({ success: false, message: "Manual Perusahaan documents require at least 2 document references" });
      }
      if (existingDocForCheck.category === "manual_halal" && parsedReferenceIds.length < 1) {
        return res.status(400).json({ success: false, message: "Manual Halal documents require at least 1 document reference" });
      }
    }

    // Get existing document with category hierarchies
    const existingDocument = await prisma.document.findFirst({
      where: {
        id: parseInt(id),
        isDeleted: false,
      },
      include: {
        department: {
          include: {
            categoryHierarchies: {
              where: { 
                isDeleted: false,
              },
              orderBy: { level: "asc" },
            },
          },
        },
      },
    });

    if (!existingDocument) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    // Check department access
    const hasViewAllAccess = canViewAllDocuments(req.user);
    if (!hasViewAllAccess) {
      const hasAccess = userBelongsToDepartment(
        req.user,
        existingDocument.departmentId
      );
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to revise this document",
        });
      }
    }

    // Prevent revision for obsolete documents
    if (existingDocument.status === "obsolete") {
      return res.status(400).json({
        success: false,
        message: "Obsolete documents cannot be revised",
      });
    }

    // Save current version to history
    await prisma.document_history.create({
      data: {
        documentId: existingDocument.id,
        name: existingDocument.name,
        description: existingDocument.description,
        version: existingDocument.version,
        revision: existingDocument.revision,
        googleDriveFileId: existingDocument.googleDriveFileId,
        filePath: existingDocument.filePath,
        fileSize: existingDocument.fileSize,
        mimeType: existingDocument.mimeType,
        masterDocumentGoogleDriveId:
          existingDocument.masterDocumentGoogleDriveId,
        masterDocumentPath: existingDocument.masterDocumentPath,
        masterDocumentFileSize: existingDocument.masterDocumentFileSize,
        masterDocumentMimeType: existingDocument.masterDocumentMimeType,
        changeDescription,
        changedBy,
        destination: existingDocument.destination,
        releaseDate: existingDocument.releaseDate,
      },
    });

    // Determine new revision number
    // If the document is approved, increment the revision number.
    // If it is draft/rejected, keep the same revision number since it wasn't published yet.
    let newRevision = existingDocument.revision;
    if (existingDocument.status === "approved") {
      newRevision += 1;
    } else {
      // Clear out failed attempts' approvals so progressive flow isn't blocked by old records
      await prisma.digital_approval.deleteMany({
        where: {
          documentId: parseInt(id),
          documentRevision: newRevision,
        },
      });
    }

    const revisionStr = String(newRevision).padStart(2, "0");

    let googleDriveFileId = existingDocument.googleDriveFileId;
    let fileSize = existingDocument.fileSize;
    let masterDocumentGoogleDriveId = existingDocument.masterDocumentGoogleDriveId;
    let masterDocumentFileSize = existingDocument.masterDocumentFileSize;
    let masterDocumentMimeType = existingDocument.masterDocumentMimeType;
    let masterDocumentPath = existingDocument.masterDocumentPath;

    // For non-WI docs: upload the provided files (if they exist)
    if (!isWorkInstruction && req.files && req.files["file"]) {
      const pdfFile = req.files["file"][0];
      const fileName = `${existingDocument.documentCode}_v${existingDocument.version}.${revisionStr}.pdf`;
      googleDriveFileId = await googleDriveService.uploadFile(
        pdfFile.buffer,
        fileName,
        pdfFile.mimetype
      );
      fileSize = pdfFile.size;

      if (req.files["masterDocumentFile"]) {
        const masterFile = req.files["masterDocumentFile"][0];
        const masterFileName = `${existingDocument.documentCode}_master_v${
          existingDocument.version
        }.${revisionStr}${path.extname(masterFile.originalname)}`;

        masterDocumentGoogleDriveId = await googleDriveService.uploadFile(
          masterFile.buffer,
          masterFileName,
          masterFile.mimetype
        );
        masterDocumentFileSize = masterFile.size;
        masterDocumentMimeType = masterFile.mimetype;
        masterDocumentPath = masterFile.originalname;
      }
    }
    // For WI docs: files will be regenerated from template data later

    // Update document with new revision
    const updatedDocument = await prisma.document.update({
      where: { id: parseInt(id) },
      data: {
        name: name || undefined,
        documentFormat: documentFormat || undefined,
        retentionPeriod: retentionPeriod || undefined,
        storageLocation: storageLocation || undefined,
        remark: remark || undefined,
        publishingInstitution: publishingInstitution || undefined,
        dateOfIssue: dateOfIssue ? new Date(dateOfIssue) : undefined,
        expiredDate: expiredDate ? new Date(expiredDate) : undefined,
        revision: newRevision,
        googleDriveFileId,
        googleDriveFinalFileId: null, // Reset final file ID
        googleDriveMasterVersionId: null, // Reset master watermarked PDF ID
        googleDriveControlledVersionId: null, // Reset controlled file ID
        googleDriveUncontrolledVersionId: null, // Reset uncontrolled file ID
        fileSize,
        masterDocumentGoogleDriveId,
        masterDocumentFileSize,
        masterDocumentMimeType,
        masterDocumentPath,
        status: "draft", // Reset to draft
        releaseDate: null, // Reset release date — each revision gets its own release date when approved
        // Old releaseDate is preserved in document_history record
      },
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

    // Note: We no longer delete existing approvals
    // Old approvals are preserved as history of previous versions
    // New revision creates fresh approval records with type="revision"

    // Get category-specific hierarchies for this document's category
    const categoryHierarchies = existingDocument.department.categoryHierarchies.filter(
      (ch) => ch.category === existingDocument.category
    );

    // Document level constant (for code generation mostly now)
    const documentLevel = getDocumentLevel(existingDocument.category);

    // ============================================
    // AUTO-INJECT QA AS LEVEL 1 "CHECKED BY" FOR REVISIONS
    // All documents from any department must be checked by QA first
    // ============================================
    const qaDepartments = await prisma.department.findMany({
      where: {
        departmentCode: "QA", // Strict match for QA department
        isDeleted: false,
      },
      include: {
        users: {
          where: { isDeleted: false },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                username: true, // Added for admin exclusion
                isDeleted: true,
                role: {
                  select: { name: true },
                },
              },
            },
          },
        },
      },
    });

    // Get all active QA users (not deleted) AND with SUPER_ADMIN role
    // Filter out generic admin accounts to ensure only designated workflow users are picked
    const qaUsers = [];
    qaDepartments.forEach((qaDept) => {
      qaDept.users.forEach((ud) => {
        const username = ud.user.username?.toLowerCase() || "";
        const fullName = ud.user.fullName?.toLowerCase() || "";

        if (
          !ud.user.isDeleted &&
          ud.user.role?.name === "SUPER_ADMIN" && // Only Super Admin
          username !== "admin" && // Skip generic admin account
          fullName !== "admin" && // Skip generic admin name
          !qaUsers.find((u) => u.id === ud.user.id)
        ) {
          qaUsers.push(ud.user);
        }
      });
    });

    if (qaUsers.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "No QA department users with 'SUPER_ADMIN' role found for document checking. Please configure valid QA users.",
      });
    }

    console.log(
      `Found ${qaUsers.length} QA (SUPER_ADMIN) users for revision Level 1 checked by:`,
      qaUsers.map((u) => u.fullName)
    );

    // Shift category hierarchy levels by +1 (QA is Level 1)
    const shiftedHierarchies = categoryHierarchies.map((h) => ({
      ...h,
      level: h.level + 1, // Shift: hierarchy Level 1 becomes Level 2
    }));

    // Note: If shiftedHierarchies is empty, the document will only require QA approval (Level 1)

    // Create NEW reference links for the new revision instead of resetting old ones
    // First, find what references are linked to this document (distinct by referenceId)
    const existingReferences = await prisma.document_reference_link.findMany({
      where: { 
        documentId: parseInt(id),
        documentRevision: existingDocument.revision
      },
      distinct: ["referenceId"],
      select: { referenceId: true },
    });

    // Create NEW reference links for the new revision instead of resetting old ones
    // EXCEPTION: Skip reference carrying for 'form' documents as they don't use it
    if (existingDocument.category !== "form") {
      if (existingDocument.status !== "approved") {
        // We are reusing the revision number, delete old reference links for this revision to reset their status
        await prisma.document_reference_link.deleteMany({
          where: {
            documentId: parseInt(id),
            documentRevision: newRevision,
          },
        });
      }

      if (hasReferenceUpdate) {
        if (parsedReferenceIds.length > 0) {
          const validReferences = await prisma.document_reference.findMany({
            where: { id: { in: parsedReferenceIds }, isActive: true },
          });

          if (validReferences.length > 0) {
            await prisma.document_reference_link.createMany({
              data: validReferences.map((ref) => ({
                documentId: parseInt(id),
                referenceId: ref.id,
                status: "pending",
                documentRevision: newRevision,
              })),
              skipDuplicates: true,
            });
          }
        }
      } else if (existingReferences.length > 0) {
        await prisma.document_reference_link.createMany({
          data: existingReferences.map((ref) => ({
            documentId: parseInt(id),
            referenceId: ref.referenceId,
            status: "pending",
            documentRevision: newRevision,
          })),
          skipDuplicates: true, // Safety check
        });
      }
    }

    // PROGRESSIVE APPROVAL: Always create Level 1 (QA) only at revision
    // Flow: Level 1 (QA checked by) → References → Level 2 → Level 3 ...
    // Create QA Level 1 approvals only
    const approvalRecords = qaUsers.map((qaUser) => ({
      documentId: parseInt(id),
      hierarchyId: null,
      categoryHierarchyId: null, // QA is auto-injected, no category hierarchy
      approverId: qaUser.id,
      level: 1,
      status: "pending",
      type: "revision",
      documentRevision: newRevision, // Tracks which revision this approval is for (01, 02, etc.)
      reason: revisionPurpose || changeDescription || null,
      createdBy: req.user.id,
    }));

    if (approvalRecords.length > 0) {
      await prisma.digital_approval.createMany({
        data: approvalRecords,
      });
      console.log(
        `Created ${
          approvalRecords.length
        } Level 1 (QA checked by) approvals for Revision ${String(newRevision).padStart(
          2,
          "0"
        )}. Next steps after QA approves.`
      );
    }

    // Get the created approval records with their IDs
    const createdApprovals = await prisma.digital_approval.findMany({
      where: {
        documentId: parseInt(id),
        level: 1,
        type: "revision", // ✅ FIXED: Changed from "approval" to "revision"
        documentRevision: newRevision,
      },
      select: {
        id: true,
        approverId: true,
      },
    });

    // Notify level 1 approvers with complete data
    if (createdApprovals.length > 0) {
      for (const approval of createdApprovals) {
        await notifyApprovers(
          parseInt(id),
          updatedDocument.name,
          updatedDocument.category || "", // documentCategory
          newRevision, // revisionNumber
          [approval.approverId],
          {
            documentCode: updatedDocument.documentCode,
            departmentName: updatedDocument.department?.name || "",
            uploaderName: req.user.fullName, // Reviser name
            level: 1,
            isRevision: true,
            approvalId: approval.id, // Pass approval ID for magic link
          }
        );
      }
    }

    // Handle Work Instruction template carry-forward during revision
    if (existingDocument.category === "instruksi_kerja") {
      try {
        // Get previous active template
        const prevTemplate = await prisma.work_instruction_template.findFirst({
          where: { documentId: parseInt(id), isActive: true },
        });

        // Mark old template as inactive
        if (prevTemplate) {
          await prisma.work_instruction_template.update({
            where: { id: prevTemplate.id },
            data: { isActive: false },
          });
        }

        // Use new templateData from body, or carry forward previous
        const parsed = templateData
          ? (typeof templateData === "string" ? JSON.parse(templateData) : templateData)
          : prevTemplate
            ? { ...(typeof prevTemplate.templateData === "string" ? JSON.parse(prevTemplate.templateData) : prevTemplate.templateData), style: prevTemplate.styleData }
            : null;

        if (parsed) {
          const contentPayload = {
            topSections: parsed.topSections || [],
            instructionText: parsed.instructionText || "",
            sections: parsed.sections || [],
            attachments: parsed.attachments || [],
            pages: parsed.pages || null,
          };

          await prisma.work_instruction_template.create({
            data: {
              documentId: parseInt(id),
              version: existingDocument.version,
              revision: newRevision,
              templateData: contentPayload,
              styleData: parsed.style || prevTemplate?.styleData || null,
              sectionCount: contentPayload.sections.length,
              attachmentCount: contentPayload.attachments.length,
            },
          });

          // Re-generate PDF/Excel from template
          const generatedFiles = await templateGeneratorService.generateFiles(
            {
              documentCode: updatedDocument.documentCode,
              name: updatedDocument.name || existingDocument.name,
              releaseDate: new Date(),
              revision: newRevision,
            },
            parsed
          );

          // Upload regenerated PDF to Google Drive
          const revStr = String(newRevision).padStart(2, "0");
          const pdfFileName = `${updatedDocument.documentCode}_v${existingDocument.version}.${revStr}.pdf`;
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
            const xlsxFileName = `${updatedDocument.documentCode}_master_v${existingDocument.version}.${revStr}.xlsx`;
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
        }
      } catch (templateError) {
        console.error("Error handling template during revision:", templateError);
        // Non-fatal: revision still succeeds
      }
    }

    // Log document revision
    await createLog({
      action: "REVISE",
      table: "document",
      userId: req.user.id,
      description: `User ${req.user.fullName} merevisi document ${
        updatedDocument.documentCode
      } - ${updatedDocument.name} dari v${existingDocument.version}.${String(
        existingDocument.revision
      ).padStart(2, "0")} ke v${updatedDocument.version}.${String(
        updatedDocument.revision
      ).padStart(2, "0")} di departemen ${
        existingDocument.department.name
      }. Alasan: ${changeDescription || "Tidak ada keterangan"}`,
      departmentId: updatedDocument.departmentId,
    });

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
      message: "Document revised successfully",
      data: finalDocument,
    });
  } catch (error) {
    console.error("Error revising document:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to revise document",
    });
  }
}

module.exports = reviseDocumentHandler;
