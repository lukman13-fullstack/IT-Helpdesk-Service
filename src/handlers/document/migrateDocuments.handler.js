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

      const mimeType = "application/pdf";

      let masterMimeType = null;
      let masterFileSize = null;
      let masterPath = null;
      if (masterFileContent) {
        const ext = path.extname(masterFileContent.originalname || "");
        masterPath = `${fileNamePrefix}_master_v1.0${ext}`;
        masterMimeType = masterFileContent.mimetype;
        masterFileSize = masterFileContent.size;
      }

      let parsedRevision = 0;
      if (docMeta.revision && !isNaN(parseInt(docMeta.revision))) {
        parsedRevision = parseInt(docMeta.revision);
      }

      // Create Document in Database with PENDING_UPLOAD state
      const newDocument = await prisma.document.create({
        data: {
          name: docMeta.name,
          category: finalCategoryStr,
          documentCode,
          documentNumber,
          isInternal: isInternalBool,
          
          googleDriveFileId: "PENDING_UPLOAD",
          googleDriveFinalFileId: "PENDING_UPLOAD",
          fileSize: pdfFileContent.size,
          mimeType,
          
          masterDocumentGoogleDriveId: masterFileContent ? "PENDING_UPLOAD" : null,
          masterDocumentMimeType: masterMimeType,
          masterDocumentFileSize: masterFileSize,
          masterDocumentPath: masterPath,

          departmentId: targetDepartmentId,
          uploadedBy,
          version: 1,
          revision: parsedRevision,
          
          status: isObsolete ? "obsolete" : (hasBypassPermission ? "approved" : "draft"),
          isDeleted: isObsolete,
          isPublished: isObsolete ? false : hasBypassPermission,
          
          dateOfIssue: (() => {
            const d1 = docMeta.dateOfIssue ? new Date(docMeta.dateOfIssue) : null;
            if (d1 && !isNaN(d1.getTime())) return d1;
            const d2 = dateOfIssue ? new Date(dateOfIssue) : null;
            if (d2 && !isNaN(d2.getTime())) return d2;
            return null;
          })(),
          releaseDate: (() => {
            const d1 = docMeta.releaseDate ? new Date(docMeta.releaseDate) : null;
            if (d1 && !isNaN(d1.getTime())) return d1;
            return hasBypassPermission ? new Date() : null;
          })(),

          proposalObjective: docMeta.proposalObjective || proposalObjective,
          documentFormat: docMeta.documentFormat || documentFormat,
          retentionPeriod: docMeta.retentionPeriod || retentionPeriod,
          hardDocumentRetentionPeriod: docMeta.hardDocumentRetentionPeriod || hardDocumentRetentionPeriod,
          storageLocation: docMeta.storageLocation || storageLocation,
          hardDocumentStorageLocation: docMeta.hardDocumentStorageLocation || hardDocumentStorageLocation,
          publishingInstitution: docMeta.publishingInstitution || publishingInstitution,
          expiredDate: (() => {
            const d1 = docMeta.expiredDate ? new Date(docMeta.expiredDate) : null;
            if (d1 && !isNaN(d1.getTime())) return d1;
            const d2 = expiredDate ? new Date(expiredDate) : null;
            if (d2 && !isNaN(d2.getTime())) return d2;
            return null;
          })(),
          documentStoragePeriod: documentStoragePeriod ? parseInt(documentStoragePeriod) : null,
          remark: docMeta.remark || remark,
          destination,
        },
      });

      // Save for Phase 2
      results.push({
        document: newDocument,
        pdfFileContent,
        masterFileContent,
        fileNamePrefix,
        docMeta,
        isObsolete,
        parsedRevision
      });

      // Log action
      await createLog({
        userId: parseInt(uploadedBy),
        action: "CREATE",
        table: "document",
        description: `Migrated document: ${fileNamePrefix} - ${docMeta.name} (Obsolete: ${isObsolete})`,
        departmentId: parseInt(targetDepartmentId),
      });

      let docRefIds = parsedReferenceIds;
      if (docMeta.referenceIds && Array.isArray(docMeta.referenceIds)) {
        docRefIds = docMeta.referenceIds.map(id => parseInt(id)).filter(id => !isNaN(id));
      }

      if (docRefIds.length > 0 && !isObsolete) {
        const validReferences = await prisma.document_reference.findMany({
          where: { id: { in: docRefIds }, isActive: true },
        });

        if (validReferences.length > 0) {
          await prisma.document_reference_link.createMany({
            data: validReferences.map((ref) => ({
              documentId: newDocument.id,
              referenceId: ref.id,
              status: hasBypassPermission ? "approved" : "pending",
              checkedAt: hasBypassPermission ? new Date() : null,
              checkedBy: hasBypassPermission ? ref.checkerId : null,
            })),
          });
          console.log(`Reference links created for migrated doc ${newDocument.id}.`);
        }
      }

      if (!isObsolete) {
        let approvalRecords = [];
        if (hasBypassPermission) {
          approvalRecords = allHierarchies.map((hierarchy) => ({
            documentId: newDocument.id,
            hierarchyId: null,
            categoryHierarchyId: hierarchy.isCategorySpecific ? hierarchy.id : null,
            approverId: hierarchy.userId,
            level: hierarchy.level,
            status: "approved",
            type: "approval",
            documentRevision: parsedRevision,
            batchId,
            approvedAt: new Date(),
            approvedBy: hierarchy.userId,
            createdBy: uploadedBy,
          }));
        } else {
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
    } // End Sequential loop

    console.log(`Phase 1 Complete. Total documents processed sequentially: ${results.length}. Starting Phase 2 (Parallel Uploads)`);

    // PHASE 2 & 3: CONCURRENT BATCHED UPLOADS AND DB UPDATES
    const BATCH_SIZE = 5;
    for (let i = 0; i < results.length; i += BATCH_SIZE) {
      const batch = results.slice(i, i + BATCH_SIZE);
      
      const uploadPromises = batch.map(async (item) => {
        const { document, pdfFileContent, masterFileContent, fileNamePrefix, docMeta, isObsolete, parsedRevision } = item;
        
        try {
          // 1. Upload PDF
          const pdfFileName = `${fileNamePrefix}_v1.0.pdf`;
          const finalPdfBuffer = pdfFileContent.buffer;
          
          const googleDriveFileIdPromise = googleDriveService.uploadFile(
            finalPdfBuffer,
            pdfFileName,
            "application/pdf"
          );

          // 2. Upload Master (if exists)
          let masterGoogleDriveIdPromise = Promise.resolve(null);
          if (masterFileContent) {
            const ext = path.extname(masterFileContent.originalname || "");
            const masterFileName = `${fileNamePrefix}_master_v1.0${ext}`;
            masterGoogleDriveIdPromise = googleDriveService.uploadFile(
              masterFileContent.buffer,
              masterFileName,
              masterFileContent.mimetype
            ).catch(err => {
              console.error(`Failed to upload Master for ${fileNamePrefix}:`, err);
              return null; // Non-blocking
            });
          }

          // Execute uploads concurrently for this document
          const [googleDriveFileId, masterGoogleDriveId] = await Promise.all([
            googleDriveFileIdPromise,
            masterGoogleDriveIdPromise
          ]);

          // Update DB with actual IDs
          await prisma.document.update({
            where: { id: document.id },
            data: {
              googleDriveFileId,
              googleDriveFinalFileId: googleDriveFileId,
              masterDocumentGoogleDriveId: masterGoogleDriveId
            }
          });

          // Update the document object in results for the final response
          item.document.googleDriveFileId = googleDriveFileId;
          item.document.googleDriveFinalFileId = googleDriveFileId;
          item.document.masterDocumentGoogleDriveId = masterGoogleDriveId;

          // Background bypass processing
          if (hasBypassPermission && !isObsolete) {
             (async () => {
               try {
                 const documentId = document.id;
                 console.log("BACKGROUND: Generating cover page for bypassed migration document:", documentId);
                 
                 const approvalsForCover = await prisma.digital_approval.findMany({
                   where: { documentId: documentId, type: { in: ["approval"] }, status: "approved", documentRevision: parsedRevision },
                   orderBy: { level: "asc" },
                   include: { approver: { select: { id: true, fullName: true, email: true, position: true, role: { select: { name: true } } } } },
                 });

                 const docWithRefs = await prisma.document.findUnique({
                   where: { id: documentId },
                   include: { department: true, uploader: true, references: { include: { checker: true, reference: true } } },
                 });

                 const coverPageBuffer = await pdfGeneratorService.generateCoverPage(
                   { ...docWithRefs, releaseDate: new Date() },
                   approvalsForCover
                 );

                 const finalMergedPdfBuffer = await pdfGeneratorService.mergePDFs(
                   coverPageBuffer,
                   finalPdfBuffer
                 );

                 const finalFileName = `${fileNamePrefix}_v1.0_APPROVED.pdf`;
                 const finalFileId = await googleDriveService.uploadFile(
                   finalMergedPdfBuffer,
                   finalFileName,
                   "application/pdf"
                 );

                 await prisma.document.update({
                   where: { id: documentId },
                   data: { googleDriveFileId: finalFileId, googleDriveFinalFileId: finalFileId }
                 });

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
                 
                 const [masterId, controlledId, uncontrolledId] = await Promise.all([ masterPromise, controlledPromise, uncontrolledPromise ]);

                 await prisma.document.update({
                   where: { id: documentId },
                   data: { googleDriveMasterVersionId: masterId, googleDriveControlledVersionId: controlledId, googleDriveUncontrolledVersionId: uncontrolledId }
                 });
                 
                 console.log("BACKGROUND: Successfully processed bypassed migration document:", documentId);
               } catch(bgError) {
                 console.error("BACKGROUND Error for bypassed migration document:", bgError);
               }
             })();
          }

        } catch (error) {
          console.error(`Upload failed for document ${fileNamePrefix}:`, error);
          // Fallback: Delete or Mark as Force Deleted so number can be reused
          await prisma.document.update({
            where: { id: document.id },
            data: {
              isDeleted: true,
              status: "obsolete",
              deletionReason: "Force deleted by system due to mass migration upload failure"
            }
          });
        }
      });

      console.log(`Executing batch ${Math.floor(i / BATCH_SIZE) + 1} / ${Math.ceil(results.length / BATCH_SIZE)} (${batch.length} documents)...`);
      await Promise.all(uploadPromises);
    }
    
    // Extract actual document objects for response
    const finalResponseData = results.map(r => r.document);

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
      message: `${finalResponseData.length} documents migrated successfully`,
      data: finalResponseData,
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
