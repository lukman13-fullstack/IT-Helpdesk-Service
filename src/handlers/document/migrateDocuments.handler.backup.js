const path = require("path");
const prisma = require("../../utils/prisma");
const googleDriveService = require("../../services/googleDrive.service");
const pdfWatermarkService = require("../../services/pdfWatermark.service");
const pdfGeneratorService = require("../../services/pdfGenerator.service");
const { generateDocumentCode, isValidCategory } = require("../../utils/documentCode.util");
const { createLog } = require("../../utils/logger");
const { canBypassApproval } = require("../../utils/authorization.util");
const { notifyBatchApprovers } = require("../../utils/notification.util");

async function migrateDocumentsHandler(req, res) {
  try {
    console.log("Migrate Documents Request Body:", req.body);
    
    let {
      category,
      isInternal,
      departmentId,
      documentsData, // JSON string array of document objects
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
      destination,
      remark,
      referenceIds,
    } = req.body;

    const uploadedBy = req.user.id;
    const batchId = Date.now().toString();

    // Parse referenceIds if it's a string (from FormData)
    let parsedReferenceIds = [];
    if (referenceIds) {
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

    if (!documentsData) {
      return res.status(400).json({
        success: false,
        message: "No documents provided for migration",
      });
    }

    let parsedDocuments = [];
    try {
      parsedDocuments = typeof documentsData === "string" ? JSON.parse(documentsData) : documentsData;
      if (!Array.isArray(parsedDocuments)) {
        parsedDocuments = [parsedDocuments];
      }
    } catch (e) {
      console.log("Failed to parse documentsData:", e);
      return res.status(400).json({
        success: false,
        message: "Invalid documentsData format",
      });
    }

    if (parsedDocuments.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Documents list cannot be empty",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: uploadedBy },
      include: {
        departments: {
          where: { isDeleted: false },
          include: { department: true },
        },
      },
    });

    if (!user || user.departments.length === 0) {
      return res.status(400).json({
        success: false,
        message: "User does not belong to any department",
      });
    }

    // Determine target department
    let targetDepartmentId = user.departments[0].departmentId;
    const userDepartments = user.departments.map((ud) => ud.department.departmentCode);
    const userDepartmentIds = user.departments.map((ud) => ud.departmentId);
    const isQaUser = userDepartments.includes("QA");

    // If QA user specifies a departmentId, they can migrate on behalf of that department
    if (isQaUser && departmentId) {
      const targetDept = await prisma.department.findUnique({
        where: { id: parseInt(departmentId) },
      });
      if (targetDept && !targetDept.isDeleted) {
        targetDepartmentId = targetDept.id;
      }
    } else if (departmentId && userDepartmentIds.includes(parseInt(departmentId))) {
       targetDepartmentId = parseInt(departmentId);
    }

    const isInternalBool = isInternal === "true" || isInternal === true;

    if (isInternalBool && !category) {
      return res.status(400).json({
        success: false,
        message: "Category is required for Internal documents",
      });
    }
    if (isInternalBool && !isValidCategory(category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category: ${category}`,
      });
    }

    // Validate mandatory references for manual categories
    if (isInternalBool && category === "manual_perusahaan") {
      if (parsedReferenceIds.length < 2) {
        return res.status(400).json({
          success: false,
          message: "Manual Perusahaan documents require at least 2 document references",
        });
      }
    }
    if (isInternalBool && category === "manual_halal") {
      if (parsedReferenceIds.length < 1) {
        return res.status(400).json({
          success: false,
          message: "Manual Halal documents require at least 1 document reference",
        });
      }
    }

    // CHECK PERMISSIONS & HIERARCHIES
    const hasBypassPermission = canBypassApproval(req.user);

    const department = await prisma.department.findUnique({
      where: { id: parseInt(targetDepartmentId) },
      include: {
        categoryHierarchies: {
          where: { isDeleted: false },
          orderBy: { level: "asc" },
          include: {
            user: { select: { id: true, fullName: true } },
          },
        },
      },
    });

    if (!department) {
      return res.status(404).json({ success: false, message: "Department not found" });
    }

    // FETCH QA USERS
    const qaDepartments = await prisma.department.findMany({
      where: { departmentCode: "QA", isDeleted: false },
      include: {
        users: {
          where: { isDeleted: false },
          include: {
            user: {
              select: {
                id: true, fullName: true, username: true, isDeleted: true, role: { select: { name: true } }
              },
            },
          },
        },
      },
    });

    const qaUsers = [];
    qaDepartments.forEach((qaDept) => {
      qaDept.users.forEach((ud) => {
        const username = ud.user.username?.toLowerCase() || "";
        const fullName = ud.user.fullName?.toLowerCase() || "";
        if (!ud.user.isDeleted && ud.user.role?.name === "SUPER_ADMIN" && username !== "admin" && fullName !== "admin" && !qaUsers.find((u) => u.id === ud.user.id)) {
          qaUsers.push(ud.user);
        }
      });
    });

    if (!hasBypassPermission && qaUsers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No QA department users with 'SUPER_ADMIN' role found for document checking. Please configure valid QA users.",
      });
    }

    const documentCategory = isInternalBool ? category : "external";
    const categoryHierarchies = department.categoryHierarchies.filter((ch) => ch.category === documentCategory);
    
    const effectiveHierarchies = categoryHierarchies.map((ch) => ({
      id: ch.id, userId: ch.userId, level: ch.level + 1, user: ch.user, isCategorySpecific: true,
    }));

    const singleQaUser = qaUsers.length > 0 ? [qaUsers[0]] : [];
    const qaLevel1Hierarchies = singleQaUser.map((qaUser) => ({
      id: null, userId: qaUser.id, level: 1, user: qaUser, isCategorySpecific: false, isQaAutoInjected: true,
    }));

    const allHierarchies = [...qaLevel1Hierarchies, ...effectiveHierarchies];

    // Keep track of migrated document results & pending approvals
    const results = [];
    const createdApprovalsToNotify = [];

    // Ensure processing happens sequentially to guarantee auto-increment order
    for (let i = 0; i < parsedDocuments.length; i++) {
      const docMeta = parsedDocuments[i];
      let pdfFileContent = null;
      let masterFileContent = null;
      
      // Find matching files from req.files array
      if (req.files && Array.isArray(req.files)) {
        pdfFileContent = req.files.find((f) => f.fieldname === `pdfFile_${i}`);
        masterFileContent = req.files.find((f) => f.fieldname === `masterFile_${i}`);
      }

      if (!pdfFileContent) {
        return res.status(400).json({
          success: false,
          message: `PDF file is missing for document at index ${i + 1}`,
        });
      }

      // Generate Auto-Increment Code securely
      let documentCode = "";
      let documentNumber = 0;
      let externalFileId = "";
      
      if (isInternalBool) {
        const generated = await generateDocumentCode(
          targetDepartmentId,
          category,
          true,
          false
        );
        documentCode = generated.documentCode;
        documentNumber = generated.documentNumber;
      } else {
        const now = new Date();
        const dateStr = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        documentCode = ""; 
        documentNumber = 0;
        externalFileId = `EXT-${dateStr}-${random}`;
      }

      const fileNamePrefix = isInternalBool ? documentCode : externalFileId;
      const finalCategoryStr = isInternalBool ? category : "external";
      const isObsolete = docMeta.isObsolete === "true" || docMeta.isObsolete === true;
      
      // Use original buffer for initial upload (watermarks will be added later during bypass/approval)
      const finalPdfBuffer = pdfFileContent.buffer;

      const pdfFileName = `${fileNamePrefix}_v1.0.pdf`;
      const mimeType = "application/pdf";

      // Upload PDF
      let googleDriveFileId = null;
      try {
        googleDriveFileId = await googleDriveService.uploadFile(
          finalPdfBuffer,
          pdfFileName,
          mimeType
        );
      } catch (uploadError) {
        console.error(`Failed to upload PDF for ${documentCode}:`, uploadError);
        throw uploadError;
      }

      // Upload Master (if exists)
      let masterGoogleDriveId = null;
      let masterMimeType = null;
      let masterFileSize = null;

      if (masterFileContent) {
        const ext = path.extname(masterFileContent.originalname || "");
        const masterFileName = `${fileNamePrefix}_master_v1.0${ext}`;
        masterMimeType = masterFileContent.mimetype;
        masterFileSize = masterFileContent.size;

        try {
          masterGoogleDriveId = await googleDriveService.uploadFile(
            masterFileContent.buffer,
            masterFileName,
            masterMimeType
          );
        } catch (uploadError) {
          console.error(`Failed to upload Master for ${documentCode}:`, uploadError);
          // Non-blocking for master file failure
        }
      }

      let parsedRevision = 0;
      if (docMeta.revision && !isNaN(parseInt(docMeta.revision))) {
        parsedRevision = parseInt(docMeta.revision);
      }

      // Create Document in Database
      const newDocument = await prisma.document.create({
        data: {
          name: docMeta.name,
          category: finalCategoryStr,
          documentCode,
          documentNumber,
          isInternal: isInternalBool,
          
          googleDriveFileId,
          googleDriveFinalFileId: googleDriveFileId,
          fileSize: pdfFileContent.size,
          mimeType,
          
          masterDocumentGoogleDriveId: masterGoogleDriveId,
          masterDocumentMimeType: masterMimeType,
          masterDocumentFileSize: masterFileSize,

          departmentId: targetDepartmentId,
          uploadedBy,
          version: 1,
          revision: parsedRevision,
          
          // Migration specifics
          status: isObsolete ? "obsolete" : (hasBypassPermission ? "approved" : "draft"),
          isDeleted: isObsolete,
          isPublished: isObsolete ? false : hasBypassPermission,
          
          dateOfIssue: docMeta.dateOfIssue ? new Date(docMeta.dateOfIssue) : (dateOfIssue ? new Date(dateOfIssue) : null),
          releaseDate: docMeta.releaseDate ? new Date(docMeta.releaseDate) : (hasBypassPermission ? new Date() : null),

          proposalObjective: docMeta.proposalObjective || proposalObjective,
          documentFormat: docMeta.documentFormat || documentFormat,
          retentionPeriod: docMeta.retentionPeriod || retentionPeriod,
          hardDocumentRetentionPeriod: docMeta.hardDocumentRetentionPeriod || hardDocumentRetentionPeriod,
          storageLocation: docMeta.storageLocation || storageLocation,
          hardDocumentStorageLocation: docMeta.hardDocumentStorageLocation || hardDocumentStorageLocation,
          publishingInstitution,
          expiredDate: expiredDate ? new Date(expiredDate) : null,
          documentStoragePeriod: documentStoragePeriod ? parseInt(documentStoragePeriod) : null,
          remark: docMeta.remark || remark,
          destination,
        },
      });

      // NOTE: No document_history record is created here for migration.
      // The getDocumentHistory API automatically includes the current document
      // as the latest entry. History records are only created during revisions.

      // Log action
      await createLog({
        userId: parseInt(uploadedBy),
        action: "CREATE",
        table: "document",
        description: `Migrated document: ${fileNamePrefix} - ${docMeta.name} (Obsolete: ${isObsolete})`,
        departmentId: parseInt(targetDepartmentId),
      });

      // Use document specific referenceIds if available, otherwise fallback to global
      let docRefIds = parsedReferenceIds;
      if (docMeta.referenceIds && Array.isArray(docMeta.referenceIds)) {
        docRefIds = docMeta.referenceIds.map(id => parseInt(id)).filter(id => !isNaN(id));
      }

      // Create document reference links if referenceIds provided
      if (docRefIds.length > 0 && !isObsolete) {
        // Validate that all references exist and are active
        const validReferences = await prisma.document_reference.findMany({
          where: {
            id: { in: docRefIds },
            isActive: true,
          },
        });

        if (validReferences.length > 0) {
          // Create reference links with pending status
          // Reference checkers will be notified AFTER Level 1 approves
          await prisma.document_reference_link.createMany({
            data: validReferences.map((ref) => ({
              documentId: newDocument.id,
              referenceId: ref.id,
              status: hasBypassPermission ? "approved" : "pending",
              checkedAt: hasBypassPermission ? new Date() : null,
              checkedBy: hasBypassPermission ? ref.checkerId : null,
            })),
          });

          console.log(
            `Reference links created for migrated doc ${newDocument.id}.`
          );
        }
      }

      // APPROVAL TICKETS — MIGRATION FLOW
      if (!isObsolete) {
        let approvalRecords = [];
        if (hasBypassPermission) {
          // Bypass: create all approvals as approved (QA + hierarchy levels)
          approvalRecords = allHierarchies.map((hierarchy) => ({
            documentId: newDocument.id,
            hierarchyId: null, // Not using old hierarchy
            categoryHierarchyId: hierarchy.isCategorySpecific ? hierarchy.id : null,
            approverId: hierarchy.userId,
            level: hierarchy.level,
            status: "approved",
            type: "approval", // Migration Doc
            documentRevision: parsedRevision,
            batchId,
            approvedAt: new Date(),
            approvedBy: hierarchy.userId,
            createdBy: uploadedBy,
          }));
        } else {
          // Normal: Create Level 1 (QA) approvals ONLY
          // Level 2+ will be auto-approved by the system when QA approves
          approvalRecords = allHierarchies
            .filter((h) => h.level === 1)
            .map((hierarchy) => ({
              documentId: newDocument.id,
              hierarchyId: null,
              categoryHierarchyId: hierarchy.isCategorySpecific ? hierarchy.id : null,
              approverId: hierarchy.userId,
              level: hierarchy.level,
              status: "pending",
              type: "approval",
              documentRevision: parsedRevision,
              batchId,
              createdBy: uploadedBy,
            }));
        }

        if (approvalRecords.length > 0) {
          await prisma.digital_approval.createMany({ data: approvalRecords });
        }

        if (!hasBypassPermission) {
          // Collect Level 1 approvals for batch email notification
          const createdLevel1s = await prisma.digital_approval.findMany({
            where: { documentId: newDocument.id, level: 1, type: "approval", documentRevision: parsedRevision },
            select: { id: true, approverId: true }
          });

          createdLevel1s.forEach(appr => {
            createdApprovalsToNotify.push({
              approverId: appr.approverId,
              documentId: newDocument.id,
              documentCode: documentCode,
              documentName: docMeta.name,
              approvalId: appr.id
            });
          });
        }
      }

      // BACKGROUND PROCESSING FOR BYPASSED DOCUMENTS (COVER PAGE & FINAL WATERMARKS)
      if (hasBypassPermission && !isObsolete) {
         (async () => {
           try {
             const documentId = newDocument.id;
             console.log("BACKGROUND: Generating cover page for bypassed migration document:", documentId);
             
             // Fetch actual approval records for cover page
             const approvalsForCover = await prisma.digital_approval.findMany({
               where: {
                 documentId: documentId,
                 type: { in: ["approval"] },
                 status: "approved",
                 documentRevision: parsedRevision,
               },
               orderBy: { level: "asc" },
               include: {
                 approver: {
                   select: {
                     id: true, fullName: true, email: true, position: true, role: { select: { name: true } },
                   },
                 },
               },
             });

             // Fetch full document data
             const docWithRefs = await prisma.document.findUnique({
               where: { id: documentId },
               include: {
                 department: true,
                 uploader: true,
                 references: {
                   include: { checker: true, reference: true },
                 },
               },
             });

             // Generate cover page
             const coverPageBuffer = await pdfGeneratorService.generateCoverPage(
               { ...docWithRefs, releaseDate: new Date() },
               approvalsForCover
             );

             // Merge with ORIGINAL BUFFER (which has initial watermark applied above)
             const finalMergedPdfBuffer = await pdfGeneratorService.mergePDFs(
               coverPageBuffer,
               finalPdfBuffer
             );

             // Upload final approved version
             const finalFileName = `${fileNamePrefix}_v1.0_APPROVED.pdf`;
             const finalFileId = await googleDriveService.uploadFile(
               finalMergedPdfBuffer,
               finalFileName,
               "application/pdf"
             );

             // UPDATE DOCUMENT IN DB FIRST to ensure Cover Page is visible even if watermarks fail
             await prisma.document.update({
               where: { id: documentId },
               data: {
                 googleDriveFileId: finalFileId,
                 googleDriveFinalFileId: finalFileId,
               }
             });

             // Generate & Upload Watermarks sequentially or parallel with fallback
             const masterPromise = (async () => {
                const buf = await pdfWatermarkService.addMasterWatermark(finalMergedPdfBuffer).catch(e => { console.error("WM err", e); return finalMergedPdfBuffer; });
                return googleDriveService.uploadFile(buf, `${fileNamePrefix}_v1.0_MASTER.pdf`, "application/pdf");
             })();
             
             const controlledPromise = (async () => {
                const buf = await pdfWatermarkService.addControlledWatermark(finalMergedPdfBuffer).catch(e => { console.error("WM err", e); return finalMergedPdfBuffer; });
                return googleDriveService.uploadFile(buf, `${fileNamePrefix}_v1.0_CONTROLLED.pdf`, "application/pdf");
             })();
             
             const uncontrolledPromise = (async () => {
                const buf = await pdfWatermarkService.addUncontrolledWatermark(finalMergedPdfBuffer).catch(e => { console.error("WM err", e); return finalMergedPdfBuffer; });
                return googleDriveService.uploadFile(buf, `${fileNamePrefix}_v1.0_UNCONTROLLED.pdf`, "application/pdf");
             })();
             
             const [masterId, controlledId, uncontrolledId] = await Promise.all([
                masterPromise, controlledPromise, uncontrolledPromise
             ]);

             // UPDATE DOCUMENT IN DB with watermark IDs
             await prisma.document.update({
               where: { id: documentId },
               data: {
                 googleDriveMasterVersionId: masterId,
                 googleDriveControlledVersionId: controlledId,
                 googleDriveUncontrolledVersionId: uncontrolledId,
               }
             });
             
             console.log("BACKGROUND: Successfully processed bypassed migration document:", documentId);
           } catch(bgError) {
             console.error("BACKGROUND Error for bypassed migration document:", bgError);
           }
         })();
      }


      results.push(newDocument);
    } // End loop

    // SINGLE NOTIFICATION BATCH PER QA APPROVER
    if (createdApprovalsToNotify.length > 0) {
      const approverMap = {};
      createdApprovalsToNotify.forEach(appr => {
        if (!approverMap[appr.approverId]) approverMap[appr.approverId] = [];
        approverMap[appr.approverId].push(appr);
      });

      const departmentName = department.name || "Unknown Department";

      for (const approverId in approverMap) {
        const docs = approverMap[approverId];
        await notifyBatchApprovers(
          parseInt(approverId),
          docs,
          category,
          departmentName,
          req.user.fullName,
          batchId
        );
      }
    }


    return res.status(201).json({
      success: true,
      message: `${results.length} documents migrated successfully`,
      data: results,
    });

  } catch (error) {
    console.error("Error migrating documents:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to migrate documents",
    });
  }
}

module.exports = migrateDocumentsHandler;
