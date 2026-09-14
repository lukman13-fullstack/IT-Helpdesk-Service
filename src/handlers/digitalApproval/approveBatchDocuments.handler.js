const prisma = require("../../utils/prisma");
const { getHierarchyConfiguration, finalizeDocumentApproval, handleReferenceCheckPhase, createNextLevelApprovals } = require("./approveDocument.handler");
const { calculateExpiryDate } = require("../../utils/workingDays.util");
const { notifyPrintApproved } = require("../../utils/notification.util");
const { sendBatchApprovalRequestEmail } = require("../../services/email.service");
const { createLog } = require("../../utils/logger");

/**
 * Handle Batch Approval for Migrated Documents ONLY
 * This avoids sending a separate email for every single document in a batch.
 */
async function approveBatchDocumentsHandler(req, res) {
  try {
    const { approvalIds, comments } = req.body;
    const userId = req.user.id;

    if (!approvalIds || !Array.isArray(approvalIds) || approvalIds.length === 0) {
      return res.status(400).json({ success: false, message: "No approvals provided" });
    }

    const successfulApprovals = [];
    const failedApprovals = [];
    
    // We will collect all newly created next-level approvals here to group emails
    const nextLevelApprovalsByUser = {}; // { approverId: [{ document, level, ... }] }
    
    // Collect fully approved documents to consolidate "Final Approval" emails
    const fullyApprovedDocsByUploader = {}; // { uploaderId: { user, docs: [] } }

    // Process each document sequentially
    for (const id of approvalIds) {
      try {
        const approval = await prisma.digital_approval.findUnique({
          where: { id: parseInt(id) },
          include: {
            document: {
              include: {
                department: { select: { id: true, name: true, departmentCode: true } },
                uploader: { select: { id: true, fullName: true, email: true } },
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

        if (!approval || approval.approverId !== userId || approval.status !== "pending") {
          failedApprovals.push({ id, reason: "Invalid approval state or unauthorized" });
          continue;
        }

        // Validate Progressive Approval
        let isValid = true;
        if (approval.type !== "deletion" && approval.type !== "print") {
          for (let lvl = 1; lvl < approval.level; lvl++) {
            const levelApprovals = approval.document.approvals.filter(
              (a) => a.level === lvl && a.type === approval.type && a.documentRevision === approval.documentRevision
            );
            
            if (!levelApprovals.some((a) => a.status === "approved")) {
              failedApprovals.push({ id, reason: `Previous level ${lvl} must be approved first` });
              isValid = false;
              break;
            }
          }
        }
        if (!isValid) continue;

        // 2. Update Status
        await prisma.digital_approval.update({
          where: { id: parseInt(id) },
          data: { status: "approved", comments, approvedAt: new Date(), approvedBy: userId },
        });

        // Cancel siblings
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

        // 3. Handle specific flows
        if (approval.type === "approval" || approval.type === "revision" || approval.type === "deletion") {
          // Re-fetch to check completion with the newly approved status included natively
          const currentLevelApprovals = approval.document.approvals.filter(
            (a) => a.level === approval.level && a.type === approval.type && a.documentRevision === approval.documentRevision
          );
          const isCurrentLevelFullyApproved = currentLevelApprovals.some((a) => a.status === "approved" || a.id === approval.id);
          
          if (isCurrentLevelFullyApproved) {
            const { effectiveHierarchies, maxHierarchyLevel } = await getHierarchyConfiguration(approval);
            const nextLevel = approval.level + 1;

            // [GOD MODE] Step 1: Absolute Migration Detection — MUST run BEFORE reference check
            const migrationCheck = await prisma.digital_approval.findFirst({
              where: { 
                documentId: approval.documentId,
                type: approval.type,
                documentRevision: approval.documentRevision,
                batchId: { not: null } 
              },
              select: { batchId: true }
            });
            const isMigration = !!(migrationCheck || approval.batchId);
            const currentBatchId = migrationCheck?.batchId || approval.batchId;
            console.log(`[BATCH] Doc ${approval.documentId}: isMigration=${isMigration}, batchId=${currentBatchId}`);

            // Reference Check Phase — BYPASSED for migrations
            if (approval.level === 1) {
              const refCheckResult = await handleReferenceCheckPhase(approval, isMigration);
              if (refCheckResult === "CHECK_PENDING" && !isMigration) {
                await finalizeDocumentApproval(approval, userId, req.user);
                successfulApprovals.push({ id, message: "Waiting for reference check" });
                continue;
              }
            }

            // [GOD MODE] Step 2: Create next level approvals
            if (isMigration || nextLevel <= maxHierarchyLevel) {
              await createNextLevelApprovals(
                approval.documentId,
                nextLevel,
                effectiveHierarchies,
                approval.type,
                userId,
                approval.document.name,
                approval.documentRevision,
                approval.document.documentCode,
                approval.type === "deletion" ? (approval.creator?.fullName || approval.document.uploader?.fullName || "") : (approval.document.uploader?.fullName || ""),
                approval.reason,
                approval.document.category || "",
                approval.document.department?.name || "",
                currentBatchId,
                { isMigration, skipNotification: true }
              );

              // Only collect for email notification if NOT migration
              if (!isMigration) {
                const createdLevelApprovals = await prisma.digital_approval.findMany({
                  where: { documentId: approval.documentId, level: nextLevel, type: approval.type, documentRevision: approval.documentRevision }
                });

                for (const newAppr of createdLevelApprovals) {
                  if (approval.type === "deletion") {
                    const { notifyDeletionRequest } = require("../../utils/notification.util");
                    await notifyDeletionRequest(approval.documentId, approval.document.name, [newAppr.approverId], {
                      documentCode: approval.document.documentCode,
                      requesterName: approval.creator?.fullName || approval.document.uploader?.fullName || "",
                      reason: approval.reason || "",
                      approvalId: newAppr.id
                    });
                  } else {
                    if (!nextLevelApprovalsByUser[newAppr.approverId]) {
                      nextLevelApprovalsByUser[newAppr.approverId] = { 
                        batchId: currentBatchId,
                        docs: [] 
                      };
                    }
                    nextLevelApprovalsByUser[newAppr.approverId].docs.push({
                      documentId: approval.documentId,
                      documentCode: approval.document.documentCode,
                      documentName: approval.document.name,
                      category: approval.document.category,
                      departmentName: approval.document.department?.name,
                      uploaderName: approval.document.uploader?.fullName,
                      revision: approval.documentRevision,
                      level: newAppr.level
                    });
                  }
                }
              }
            }

            // [GOD MODE] Step 3: Forced Clearance — nuke ALL remaining pending levels
            if (isMigration) {
               console.log(`[BATCH-GOD] Forced Clearance for Doc: ${approval.documentId}`);
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
               console.log(`[BATCH-GOD] Forced Clearance for References of Doc: ${approval.documentId}`);
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

          // Finalize (Consolidate Final Approval notifications for migration docs)
          // FIX: Only skip notification if the CURRENT approval has a batchId
          const isMigrationBatch = !!approval.batchId;
          const result = await finalizeDocumentApproval(approval, userId, req.user, { skipNotification: isMigrationBatch });
          
          if (isMigrationBatch && result.data?.allApproved) {
            const uploaderId = approval.document.uploadedBy;
            if (!fullyApprovedDocsByUploader[uploaderId]) {
              fullyApprovedDocsByUploader[uploaderId] = {
                user: approval.document.uploader,
                docs: []
              };
            }
            fullyApprovedDocsByUploader[uploaderId].docs.push({
              documentId: approval.document.id,
              documentCode: approval.document.documentCode,
              documentName: approval.document.name
            });
          }
        } else if (approval.type === "print") {
          // --- PRINT FLOW ---
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
          const approver = req.user;
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
              details: `Approved print request for ${printRequest.document.name} via Batch`,
          });
        }

        successfulApprovals.push({ id });

      } catch (err) {
        console.error(`Error processing batch approval for ID ${id}:`, err);
        failedApprovals.push({ id, reason: err.message });
      }
    }

    // --- 4. Send Batched Notifications to Next Approvers (only for non-migration) ---
    if (Object.keys(nextLevelApprovalsByUser).length > 0) {
      const appUrl = process.env.VITE_API_URL ? process.env.VITE_API_URL.replace("/api", "") : (process.env.CORS_ORIGIN || "http://localhost:5173");
      
      for (const [approverIdStr, batchInfo] of Object.entries(nextLevelApprovalsByUser)) {
        if (batchInfo.docs.length === 0) continue;
        
        const approverId = parseInt(approverIdStr);
        try {
          const approver = await prisma.user.findUnique({
            where: { id: approverId },
            select: { id: true, email: true, fullName: true }
          });

          if (approver && approver.email) {
              const repDoc = batchInfo.docs[0];
              
              await sendBatchApprovalRequestEmail({
                userId: approver.id,
                toEmail: approver.email,
                toName: approver.fullName || "Approver",
                docs: batchInfo.docs,
                uploaderName: repDoc.uploaderName || "System",
                documentCategory: repDoc.category,
                departmentName: repDoc.departmentName,
                appUrl,
                batchId: batchInfo.batchId
              });
              console.log(`Sent batched notification to ${approver.email} for ${batchInfo.docs.length} downstream documents.`);
          }
        } catch (emailErr) {
          console.error(`Failed to send batch email to approver ${approverId}:`, emailErr);
        }
      }
    }

    // --- 5. Send Consolidated "Fully Approved" Notifications to Requesters ---
    const { notifyBatchDocumentApproved } = require("../../utils/notification.util");
    const approverName = req.user.fullName || "QA Admin";

    for (const [uploaderIdStr, info] of Object.entries(fullyApprovedDocsByUploader)) {
      if (info.docs.length === 0) continue;
      
      const uploaderId = parseInt(uploaderIdStr);
      try {
        await notifyBatchDocumentApproved(uploaderId, info.docs, approverName);
        console.log(`Sent consolidated approval notification to uploader ${uploaderId} for ${info.docs.length} documents.`);
      } catch (notifyErr) {
        console.error(`Failed to send consolidated approval notification to uploader ${uploaderId}:`, notifyErr);
      }
    }


    return res.status(200).json({
      success: true,
      message: `Batch processed: ${successfulApprovals.length} succeeded, ${failedApprovals.length} failed.`,
      successful: successfulApprovals.length,
      failed: failedApprovals.length,
      failedDetails: failedApprovals
    });

  } catch (error) {
    console.error("Error in approveBatchDocumentsHandler:", error);
    return res.status(500).json({ success: false, message: "Internal server error during batch approval" });
  }
}

module.exports = { approveBatchDocumentsHandler };
