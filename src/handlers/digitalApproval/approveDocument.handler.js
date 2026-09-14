const prisma = require("../../utils/prisma");
const googleDriveService = require("../../services/googleDrive.service");
const pdfGeneratorService = require("../../services/pdfGenerator.service");
const pdfWatermarkService = require("../../services/pdfWatermark.service");
const { notifyApprovers, notifyDeletionRequest, notifyDeletionFullyApproved, notifyReferenceCheckers, notifyPrintApproved, notifyDocumentApproved } = require("../../utils/notification.util");
const { createLog } = require("../../utils/logger");
const { calculateExpiryDate } = require("../../utils/workingDays.util");
const { getDocumentLevel } = require("../../utils/documentCode.util");

/**
 * Main Handler: Approve Document
 */
async function approveDocumentHandler(req, res) {
  try {
    const { id } = req.params;
    const { comments } = req.body;
    const userId = req.user.id;

    // 1. Validation & Authorization
    const approval = await prisma.digital_approval.findUnique({
      where: { id: parseInt(id) },
      include: {
        document: {
          include: {
            department: {
              select: { id: true, name: true, departmentCode: true },
            },
            uploader: {
              select: { id: true, fullName: true, email: true },
            },
            approvals: {
              orderBy: { level: "asc" },
              include: {
                approver: { select: { id: true, fullName: true, email: true } },
              },
            },
          },
        },
        creator: {
          select: { id: true, fullName: true }
        },
      },
    });

    if (!approval) return res.status(404).json({ success: false, message: "Approval request not found" });
    if (approval.approverId !== userId) return res.status(403).json({ success: false, message: "Not authorized" });
    if (approval.status !== "pending") return res.status(400).json({ success: false, message: `Already ${approval.status}` });

    // Validate Progressive Approval (unless deletion/print)
    if (approval.type !== "deletion" && approval.type !== "print") {
      // Check each previous level from 1 to current - 1
      for (let lvl = 1; lvl < approval.level; lvl++) {
        const levelApprovals = approval.document.approvals.filter(
          (a) =>
            a.level === lvl &&
            a.type === approval.type &&
            a.documentRevision === approval.documentRevision
        );
        
        // At least one person from the previous level must have approved
        if (!levelApprovals.some((a) => a.status === "approved")) {
          return res.status(400).json({ 
            success: false, 
            message: `Previous level ${lvl} must be approved first` 
          });
        }
      }
    }

    // 2. Update Status
    await prisma.digital_approval.update({
      where: { id: parseInt(id) },
      data: { status: "approved", comments, approvedAt: new Date(), approvedBy: userId },
    });

    // --- CANCEL SIBLINGS (Single Approval per Level) ---
    // If one person at this level approves, others are cancelled to prevent redundancy
    await prisma.digital_approval.updateMany({
      where: { 
        documentId: approval.documentId, 
        level: approval.level, 
        type: approval.type, 
        status: "pending", 
        id: { not: parseInt(id) },
        documentRevision: approval.documentRevision
      },
      data: { status: "cancelled", approvedBy: userId, approvedAt: new Date() },
    });

    // 3. Handle Specific Flows
    
    // --- PRINT FLOW ---
    if (approval.type === "print") {
      return await handlePrintApproval(approval, userId, res);
    }

    // --- APPROVAL / REVISION / DELETION FLOW ---
    if (approval.type === "approval" || approval.type === "revision" || approval.type === "deletion") {
      const isCurrentLevelFullyApproved = checkCurrentLevelCompletion(approval);
      
      if (isCurrentLevelFullyApproved) {
        // Prepare Hierarchy Data
        const { effectiveHierarchies, maxHierarchyLevel } = await getHierarchyConfiguration(approval);
        const nextLevel = approval.level + 1;

        // [GOD MODE SYNCHRONIZATION] Absolute Migration Detection
        const migrationCheck = await prisma.digital_approval.findFirst({
          where: { 
            documentId: approval.documentId, 
            type: approval.type,
            documentRevision: approval.documentRevision,
            batchId: { not: null } 
          },
          select: { batchId: true }
        });
        const isMigration = !!migrationCheck || !!approval.batchId;
        const currentBatchId = migrationCheck?.batchId || approval.batchId;

        // 1. MODULAR STEP: Reference Check Phase (Only for approval/revision, NOT deletion)
        if (approval.level === 1 && approval.type !== "deletion") {
          const refCheckResult = await handleReferenceCheckPhase(approval, isMigration);
          if (refCheckResult === "CHECK_PENDING" && !isMigration) {
            // Publish early even if references are pending
            const finalizationResult = await finalizeDocumentApproval(approval, userId, req.user);
            
            return res.status(200).json({
              success: true,
              message: "Level 1 approved. Notifications sent to Reference Checkers. Waiting for reference approval.",
              data: { 
                  approval, 
                  allApproved: false,
                  document: finalizationResult.data.document 
              }
            });
          }
        }

        // 2. Proceed to Next Level (Only if defined in hierarchy)
        if (isMigration || nextLevel <= maxHierarchyLevel) {
          await createNextLevelApprovals(
            approval.documentId,
            nextLevel,
            effectiveHierarchies,
            approval.type,
            approval.createdBy, // Use original requester instead of current approver
            approval.document.name,
            approval.documentRevision,
            approval.document.documentCode,
            approval.creator?.fullName || approval.document.uploader?.fullName || "", // Use requester name
            approval.reason,
            approval.document.category || "",
            approval.document.department?.name || "",
            currentBatchId, // Pass absolute batchId
            { isMigration }
          );
        } else {
             console.log("No more levels defined in hierarchy. Checking completion...");
        }

        // [GOD MODE] Massive level clearance
        if (isMigration) {
            console.log(`[SINGLE-GOD] Forced Clearance for Doc: ${approval.documentId}`);
            await prisma.digital_approval.updateMany({
                where: {
                    documentId: approval.documentId,
                    status: "pending",
                    type: approval.type,
                    documentRevision: approval.documentRevision,
                    level: { gte: 2 }
                },
                data: {
                    status: "approved",
                    approvedAt: new Date(),
                    approvedBy: userId,
                    batchId: currentBatchId
                }
            });

            // [GOD MODE] Massive reference clearance
            console.log(`[SINGLE-GOD] Forced Clearance for References of Doc: ${approval.documentId}`);
            await prisma.document_reference_link.updateMany({
                where: {
                    documentId: approval.documentId,
                    status: "pending"
                },
                data: {
                    status: "approved",
                    checkedAt: new Date()
                }
            });
        }
      }
    }

    // --- DELETION FLOW & FINALIZATION ---
    // (Consolidated logic for Deletion and Final Document Generation)
    // FIX: Only skip notification if the CURRENT approval has a batchId (meaning it's part of a migration/batch action)
    // Don't check for other approvals with batchId, as that would skip notifications for all future revisions of migrated docs.
    const isMigrationBatch = !!approval.batchId;
    const result = await finalizeDocumentApproval(approval, userId, req.user, { skipNotification: isMigrationBatch });
    
    return res.status(200).json(result);

  } catch (error) {
    console.error("Error approving document:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to approve document" });
  }
}

// --- HELPER FUNCTIONS (MODULAR PATTERN) ---

/**
 * Check if all approvers at the current level have approved
 */
function checkCurrentLevelCompletion(approval) {
  const currentLevelApprovals = approval.document.approvals.filter(
    (a) =>
      a.level === approval.level &&
      a.type === approval.type &&
      a.documentRevision === approval.documentRevision
  );
  // SINGLE APPROVAL LOGIC: Completion is true if any one has approved (including the one just updated)
  return currentLevelApprovals.some((a) => a.status === "approved" || a.id === approval.id);
}

/**
 * Fetch and calculate hierarchy configuration
 */
async function getHierarchyConfiguration(approval) {
  const department = await prisma.department.findUnique({
    where: { id: approval.document.department.id },
    include: {
      categoryHierarchies: {
        where: { isDeleted: false, category: approval.document.category },
        include: { user: true },
        orderBy: { level: "asc" },
      },
      hierarchies: {
        where: { isDeleted: false },
        include: { user: true },
        orderBy: { level: "asc" },
      },
    },
  });

  const categoryHierarchies = department.categoryHierarchies || [];
  const generalHierarchies = department.hierarchies || [];

  // Use category-specific if exists, otherwise fallback to general
  const hierarchySource = categoryHierarchies.length > 0 ? categoryHierarchies : generalHierarchies;

  // Shift levels: Config Level 1 becomes Approval Level 2 (since QA is Level 1)
  const effectiveHierarchies = hierarchySource.map((h) => ({
    ...h,
    level: h.level + 1,
  }));

  const maxHierarchyLevel = Math.max(
    ...effectiveHierarchies.map((h) => h.level),
    1 // Minimum Level 1 (QA)
  );

  return { effectiveHierarchies, maxHierarchyLevel };
}

/**
 * Handle Reference Check Logic (Step 1 -> 2 transition)
 * Returns "CHECK_PENDING" if notifications sent (stop flow).
 * Returns "CHECK_APPROVED" if no refs or all approved (continue flow).
 */
async function handleReferenceCheckPhase(approval, isMigration = false) {
  console.log("=== Reference Check Phase ===");

  if (isMigration) {
    console.log("DEBUG: Migration detected. Exepting reference checks entirely.");
    return "CHECK_APPROVED";
  }
  
  // EXEMPTION: Form documents do not require reference checks
  if (approval.document?.category === "form") {
    console.log("DEBUG: Category is 'form'. Skipping reference check phase.");
    return "CHECK_APPROVED";
  }

  const revisionToCheck = approval.documentRevision ?? 0;
  
  // 1. Fetch Refs (With Fallback Logic)
  console.log(`DEBUG: Fetching refs for DocId ${approval.documentId} Rev ${revisionToCheck}`);
  let documentRefs = await prisma.document_reference_link.findMany({
    where: { documentId: approval.documentId, documentRevision: revisionToCheck },
  });
  
  if (documentRefs.length === 0) {
    console.warn(`WARNING: Strict match failed. Trying loose match (Fallback)...`);
    const looseRefs = await prisma.document_reference_link.findMany({
      where: { documentId: approval.documentId }
    });
    if (looseRefs.length > 0) {
      console.warn(`FALLBACK SUCCESS: Found ${looseRefs.length} loose refs. Using them.`);
      documentRefs = looseRefs;
    }
  }

  // 2. Check Status
  if (documentRefs.length > 0) {
    const allRefsApproved = documentRefs.every((r) => r.status === "approved");
    if (!allRefsApproved) {
      console.log("References pending. Notifying checkers...");
      
      // Notify Checkers
      // Fetch full reference details to get checkerId
      const refs = await prisma.document_reference.findMany({
        where: { id: { in: documentRefs.map((r) => r.referenceId) } },
        include: { checker: true },
      });

      const checkerData = refs
        .filter((r) => r.checkerId)
        .map((r) => {
          const refLink = documentRefs.find((dr) => dr.referenceId === r.id);
          return {
            checkerId: r.checkerId,
            referenceName: r.name,
            referenceLinkId: refLink?.id,
          };
        });

      if (checkerData.length > 0) {
        await notifyReferenceCheckers(
          approval.documentId,
          approval.document.name,
          checkerData,
          {
            documentCode: approval.document.documentCode,
            uploaderName: approval.document.uploader?.fullName || "",
          }
        );
        console.log("Notifications sent.");
      } else {
        console.warn("WARNING: Pending references but NO CHECKERS found.");
      }
      return "CHECK_PENDING"; // STOP
    }
  }
  
  return "CHECK_APPROVED"; // CONTINUE
}

/**
 * Handle Print Approval specific logic
 */
async function handlePrintApproval(approval, userId, res) {
  if (!approval.printRequestId) return res.status(500).json({ success: false, message: "Print request ID missing" });

  // Cancel siblings
  await prisma.digital_approval.updateMany({
    where: { printRequestId: approval.printRequestId, status: "pending", id: { not: approval.id } },
    data: { status: "cancelled", comments: "Cancelled - approved by another QA" },
  });

  // Update request
  const printRequest = await prisma.print_request.update({
    where: { id: approval.printRequestId },
    data: {
      status: "approved",
      approvedBy: userId,
      approvedAt: new Date(),
      expiresAt: calculateExpiryDate(new Date()),
    },
    include: { document: true, requester: true },
  });

  // Notify
  const approver = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
  await notifyPrintApproved(
    printRequest.documentId,
    printRequest.document.name,
    printRequest.requesterId,
    approver?.fullName || "QA Admin",
    { documentCode: printRequest.document.documentCode }
  );
  
  await createLog({
      userId,
      action: "APPROVE_PRINT",
      entityType: "PRINT_REQUEST",
      entityId: printRequest.id,
      details: `Approved print request for ${printRequest.document.name}`,
  });

  return res.status(200).json({ success: true, message: "Print request approved successfully" });
}

/**
 * Finalize Document (Deletion or Full Approval)
 */
/**
 * Finalize Document (Deletion or Full Approval)
 */
async function finalizeDocumentApproval(approval, userId, userObj, options = {}) {
    const { skipNotification = false } = options;
    // 1. Check Full Approval Status
    let allApproved = false;
    let allLevelsApproved = false;
    let allRefsApproved = false;

    if (approval.type === "deletion") {
        // Multi-level approval logic for deletion (matching business process)
        const { maxHierarchyLevel } = await getHierarchyConfiguration(approval);
        
        const allApprovals = await prisma.digital_approval.findMany({
            where: { documentId: approval.documentId, type: "deletion" },
        });
        
        allLevelsApproved = true;
        for (let level = 1; level <= maxHierarchyLevel; level++) {
             const levelApprovals = allApprovals.filter((a) => a.level === level);
             const levelDone = levelApprovals.length > 0 && levelApprovals.some((a) => a.status === "approved");
             if (!levelDone) { allLevelsApproved = false; break; }
        }

        allApproved = allLevelsApproved;
        
        // If approved, cancel other pending siblings at this level
        if (approval.status === "approved") {
          await prisma.digital_approval.updateMany({
              where: { 
                documentId: approval.documentId, 
                level: approval.level,
                type: "deletion", 
                status: "pending", 
                id: { not: approval.id } 
              },
              data: { status: "cancelled", approvedBy: userId, approvedAt: new Date() },
          });
        }
    } else {
        // Normal Flow: Check Hierarchy & Refs
        const { maxHierarchyLevel } = await getHierarchyConfiguration(approval);
        
        // Check levels
        const allApprovals = await prisma.digital_approval.findMany({
            where: { 
                 documentId: approval.documentId, 
                 type: approval.type,
                 documentRevision: approval.documentRevision 
            },
        });
        
        allLevelsApproved = true;
        for (let level = 1; level <= maxHierarchyLevel; level++) {
             const levelApprovals = allApprovals.filter((a) => a.level === level);
             // SINGLE APPROVAL LOGIC: Level is done if AT LEAST ONE has approved
             const levelDone = levelApprovals.length > 0 && levelApprovals.some((a) => a.status === "approved");
             if (!levelDone) { allLevelsApproved = false; break; }
        }

        // Check refs
        const documentRefs = await prisma.document_reference_link.findMany({ where: { documentId: approval.documentId } });
        allRefsApproved = documentRefs.length === 0 || documentRefs.every((r) => r.status === "approved");

        allApproved = allLevelsApproved && allRefsApproved;
        console.log(`Final Check: levels=${allLevelsApproved}, refs=${allRefsApproved} => ${allApproved}`);
    }

    let updatedDocument = null;

    // 2. Actions if Fully Approved
    if (approval.type === "deletion") {
        if (allApproved) {
            const doc = approval.document;
            console.log(`[FINAL] Marking document ${doc.documentCode} as OBSOLETE after full approval.`);

            // 1. Rename files in Google Drive (Add OBSOLETE_ prefix)
            const fileIds = [
              { id: doc.googleDriveFileId, name: "main" },
              { id: doc.masterDocumentGoogleDriveId, name: "master" },
              { id: doc.googleDriveFinalFileId, name: "final" },
              { id: doc.googleDriveControlledVersionId, name: "controlled" },
              { id: doc.googleDriveMasterVersionId, name: "master_watermarked" },
              { id: doc.googleDriveUncontrolledVersionId, name: "uncontrolled" }
            ].filter(f => f.id);

            for (const fileItem of fileIds) {
              try {
                const metadata = await googleDriveService.getFileMetadata(fileItem.id);
                if (!metadata.name.startsWith("OBSOLETE_")) {
                  await googleDriveService.renameFile(fileItem.id, `OBSOLETE_${metadata.name}`);
                  console.log(`[FINAL] Renamed ${fileItem.name} file ${fileItem.id} to OBSOLETE_${metadata.name}`);
                }
              } catch (e) {
                console.error(`[FINAL] Failed to rename ${fileItem.name} file ${fileItem.id}:`, e.message);
              }
            }

            // 2. Soft Delete: Update status to obsolete and mark as deleted
            updatedDocument = await prisma.document.update({
                where: { id: doc.id },
                data: { 
                  isDeleted: true, 
                  deletionReason: approval.reason, 
                  status: "obsolete",
                  isPublished: false 
                },
            });
            
            await prisma.notification.create({
                data: { 
                  userId: doc.uploadedBy, 
                  type: "deletion_approved", 
                  title: "Deletion Approved", 
                  message: `Document ${doc.documentCode} is now OBSOLETE.`, 
                  documentId: doc.id 
                }
            });
            
            // Fire background email notification
            notifyDeletionFullyApproved(
               doc.id,
               doc.name,
               doc.uploadedBy, // requesterId
               userObj?.fullName || "System", // approverName (QA)
               { documentCode: doc.documentCode }
            ).catch(err => {
               console.error("BACKGROUND ERROR: Failed to send fully approved deletion email:", err);
            });

            return {
              success: true,
              message: "Document has been marked as obsolete after full approval.",
              data: { allApproved: true, document: updatedDocument }
            };
        }
    } else if (allApproved || (approval.level === 1 && approval.type !== "deletion")) { 
        // OPTIMIZATION: Update status immediately, process files in background
        updatedDocument = await prisma.document.update({
            where: { id: approval.document.id },
            data: { 
                status: allApproved ? "approved" : approval.document.status,
                isPublished: allApproved ? true : approval.document.isPublished,
                releaseDate: (allApproved && !approval.document.releaseDate) ? new Date() : approval.document.releaseDate,
                // dateOfIssue is set ONCE on first-ever approval (rev 00) — never overwritten on subsequent revisions
                // Used as "Tanggal Terbit" in Master Index (original issue date)
                dateOfIssue: (allApproved && !approval.document.dateOfIssue) ? new Date() : undefined,
            }
        });

        // Trigger Background Process (Fire & Forget)
        processFinalDocumentsInBackground(approval, allApproved, userObj?.fullName || "System", { skipNotification }).catch(err => {
            console.error("BACKGROUND ERROR: Failed to process final documents for approval:", err);
        });
    }

    // 3. Log & Return
    await createLog({
         action: "APPROVE",
         table: "document",
         userId: userId,
         description: `Approved Level ${approval.level}`,
         departmentId: approval.document.departmentId
    });

    return {
        success: true,
        message: allApproved ? "Document fully approved." : "Approval recorded.",
        data: { approval, document: updatedDocument, allApproved }
    };
}

async function createNextLevelApprovals(documentId, level, hierarchies, type, createdBy, documentName, documentRevision = 0, documentCode = "", uploaderName = "", reason = null, documentCategory = "", departmentName = "", batchId = null, options = {}) {
  const { skipNotification = false } = options;
  const isMigration = !!batchId;
  const maxLevelInHierarchy = hierarchies.length > 0 ? Math.max(...hierarchies.map(h => h.level)) : level;
  
  // For migration, we create ALL remaining levels at once
  // For normal flow, we only create the current requested level
  const startLevel = level;
  const endLevel = isMigration ? maxLevelInHierarchy : level;

  const allCreatedRecords = [];

  for (let currentLvl = startLevel; currentLvl <= endLevel; currentLvl++) {
    // 1. Check if approvals for this specific level already exist
    const existingApprovals = await prisma.digital_approval.findMany({
      where: { documentId, level: currentLvl, type, documentRevision },
      select: { id: true, status: true },
    });
    
    if (existingApprovals.length > 0) {
      console.log(`Level ${currentLvl} approvals already exist for document ${documentId}. Skipping.`);
      continue;
    }

    // 2. Filter hierarchies for THIS level
    const currentLevelHierarchies = hierarchies.filter((h) => h.level === currentLvl);
    if (currentLevelHierarchies.length === 0) {
      console.log(`No hierarchies found for level ${currentLvl}`);
      continue;
    }

    const createdThisLevel = [];
    for (const hierarchy of currentLevelHierarchies) {
      const isCategoryHierarchy = hierarchy.category !== undefined;
      const approval = await prisma.digital_approval.create({
        data: {
          documentId,
          hierarchyId: isCategoryHierarchy ? null : hierarchy.id,
          categoryHierarchyId: isCategoryHierarchy ? hierarchy.id : null,
          approverId: hierarchy.userId,
          level: hierarchy.level,
          // MIGRATION: auto-approve next levels on behalf of QA
          status: isMigration ? "approved" : "pending",
          type,
          documentRevision,
          batchId,
          createdBy,
          reason,
          ...(isMigration ? { approvedAt: new Date(), approvedBy: createdBy } : {}),
        },
        select: { id: true, approverId: true, level: true },
      });
      createdThisLevel.push(approval);
      allCreatedRecords.push(approval);
    }

    // 3. Notifications: ONLY for non-migration documents
    // and only if NOT skipped by caller (batch handler)
    if (!isMigration && !skipNotification) {
      for (const approval of createdThisLevel) {
        if (type === "deletion") {
          await notifyDeletionRequest(
            documentId,
            documentName,
            [approval.approverId],
            {
              documentCode,
              requesterName: uploaderName,
              reason: reason || "",
              approvalId: approval.id,
            }
          );
        } else {
          await notifyApprovers(documentId, documentName, documentCategory, documentRevision, [approval.approverId], {
            documentCode,
            departmentName,
            uploaderName,
            level: currentLvl,
            isRevision: type === "revision",
            approvalId: approval.id,
          });
        }
      }
      console.log(`Created ${createdThisLevel.length} pending approval records for level ${currentLvl}`);
    } else if (isMigration) {
      console.log(`Created ${createdThisLevel.length} auto-approved records for level ${currentLvl} (Migration)`);
    }
  }

  return allCreatedRecords;
}

module.exports = { 
    approveDocumentHandler, 
    finalizeDocumentApproval, 
    getHierarchyConfiguration, 
    createNextLevelApprovals, 
    handleReferenceCheckPhase,
    processFinalDocumentsInBackground
};

/**
 * Background Task: Generate Final Watermarked Documents
 * detached from the main response loop to improve performance
 */
async function processFinalDocumentsInBackground(approval, allApproved, approverName = "System", options = {}) {
    const { skipNotification = false } = options;
    try {
        // Send notification to the requester when fully approved — regardless of file type
        if (allApproved && !skipNotification) {
          await notifyDocumentApproved(
              approval.document.id,
              approval.document.name,
              approval.createdBy, // Notify the person who created/initiated the request
              approverName,
              { 
                  documentCode: approval.document.documentCode, 
                  level: approval.level, 
                  isFullyApproved: true,
                  revision: approval.document.revision,
                  category: approval.document.category
              }
          );
        }

        // SKIP PDF GENERATION FOR DOCUMENTS WITHOUT FILES (e.g. EXTERNAL)
        if (!approval.document.googleDriveFileId) {
            console.log("BACKGROUND: Bypass PDF generation: No file associated with this document (External/Manual).");
            return;
        }

        // Only generate cover page (QR code) and watermarks when document is FULLY APPROVED
        if (!allApproved) {
            console.log("BACKGROUND: Skipping PDF generation — document is not fully approved yet.");
            return;
        }

        console.log("BACKGROUND: Generating Final Documents...");
        
        // Generate Cover Page
        const originalPdfBuffer = await googleDriveService.downloadFile(approval.document.googleDriveFileId);
        
        const approvalsForCover = await prisma.digital_approval.findMany({
            where: { documentId: approval.document.id, type: { in: ["approval", "revision"] }, status: "approved", documentRevision: approval.document.revision },
            orderBy: { level: "asc" },
            include: { approver: { select: { id: true, fullName: true, email: true, position: true, role: { select: { name: true } } } } }
        });
        
        const docWithRefs = await prisma.document.findUnique({
            where: { id: approval.document.id },
            include: { department: true, uploader: true, references: { include: { checker: true, reference: { include: { checker: { select: { fullName: true, email: true } } } } } } }
        });

        if (docWithRefs && docWithRefs.references) {
            docWithRefs.references = docWithRefs.references.filter(
                (r) => r.documentRevision === approval.document.revision
            );
        }

        const coverPageBuffer = await pdfGeneratorService.generateCoverPage({ ...docWithRefs, releaseDate: new Date() }, approvalsForCover);
        const mergedPdfBuffer = await pdfGeneratorService.mergePDFs(coverPageBuffer, originalPdfBuffer);
        
        // Upload Base Final (Merged)
        const baseFileName = `${approval.document.documentCode}_v${approval.document.version}.${approval.document.revision}_APPROVED.pdf`;
        const finalFileId = await googleDriveService.uploadFile(mergedPdfBuffer, baseFileName, "application/pdf");

        // Generate & Upload Watermarked Versions (PARALLEL)
        console.log("BACKGROUND: Generating watermarks...");
        
        const uploadPromises = [];

        // 1. Master
        uploadPromises.push((async () => {
             const buf = await pdfWatermarkService.addMasterWatermark(mergedPdfBuffer);
             return googleDriveService.uploadFile(buf, `MASTER_${baseFileName}`, "application/pdf");
        })());

        // 2. Controlled (Internal only)
        let controlledFileId = null;
        if (approval.document.isInternal) {
            uploadPromises.push((async () => {
                const buf = await pdfWatermarkService.addControlledWatermark(mergedPdfBuffer);
                return googleDriveService.uploadFile(buf, `CONTROLLED_${baseFileName}`, "application/pdf");
            })());
        } else {
            uploadPromises.push(Promise.resolve(null)); // Placeholder
        }
        
        // 3. Uncontrolled
        uploadPromises.push((async () => {
             const buf = await pdfWatermarkService.addUncontrolledWatermark(mergedPdfBuffer);
             return googleDriveService.uploadFile(buf, `UNCONTROLLED_${baseFileName}`, "application/pdf");
        })());

        const [masterFileId, cId, uncontrolledFileId] = await Promise.all(uploadPromises);
        controlledFileId = cId;

        // Update Document Records with File IDs
        await prisma.document.update({
            where: { id: approval.document.id },
            data: { 
                googleDriveFinalFileId: finalFileId,
                googleDriveMasterVersionId: masterFileId,
                googleDriveControlledVersionId: controlledFileId,
                googleDriveUncontrolledVersionId: uncontrolledFileId
            }
        });
            


        console.log("BACKGROUND: Final documents generated successfully.");

    } catch (e) {
        console.error("BACKGROUND ERROR: Error generating final docs:", e);
    }
}
