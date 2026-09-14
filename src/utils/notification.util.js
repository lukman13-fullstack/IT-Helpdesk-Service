const prisma = require("./prisma");
const emailService = require("../services/email.service");

// Get frontend URL from env
const getAppUrl = () => process.env.APP_FRONTEND_URL || (process.env.VITE_API_URL ? process.env.VITE_API_URL.replace("/api", "") : null) || process.env.CORS_ORIGIN || "http://localhost:5173";

/**
 * Create notification for a user
 */
async function createNotification({
  userId,
  type,
  title,
  message,
  documentId = null,
}) {
  try {
    return await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        documentId,
      },
    });
  } catch (error) {
    console.error("Error creating notification:", error);
    throw error;
  }
}

/**
 * Create notifications for multiple users
 */
async function createBulkNotifications(notifications) {
  try {
    return await prisma.notification.createMany({
      data: notifications,
    });
  } catch (error) {
    console.error("Error creating bulk notifications:", error);
    throw error;
  }
}

/**
 * Notify approvers about new document (with email)
 */
async function notifyApprovers(
  documentId,
  documentName,
  documentCategory,
  revisionNumber,
  approverIds,
  options = {}
) {
  const {
    documentCode = "",
    departmentName = "",
    uploaderName = "",
    level = 1,
    isRevision = false,
    approvalId, // Approval ID for magic link
  } = options;

  // Create in-app notifications
  const notifications = approverIds.map((approverId) => ({
    userId: approverId,
    type: isRevision ? "revision_pending" : "approval_pending",
    title: isRevision
      ? "Document Revision Approval Request"
      : "New Document Approval Request",
    message: `You have a ${
      isRevision ? `revision of` : `new`
    } document "${documentName}" waiting for your approval.`,
    documentId,
  }));

  await createBulkNotifications(notifications);

  // Debug log to track email data
  console.log("=== SENDING APPROVAL EMAIL ===");
  console.log("Document ID:", documentId);
  console.log("Document Name:", documentName);
  console.log("Document Code:", documentCode);
  console.log("Document Category:", documentCategory);
  console.log("Department Name:", departmentName);
  console.log("Revision Number:", revisionNumber);
  console.log("Uploader Name:", uploaderName);
  console.log("Level:", level);
  console.log("Is Revision:", isRevision);
  console.log("Approval ID:", approvalId);
  console.log("==============================");

  // Calculate next approver info
  const nextApproverName = await getNextStepInfo(documentId, level, revisionNumber, documentCategory);
  
  // Send emails in background (don't block)
  sendApprovalEmails(
    approverIds,
    documentId,
    documentName,
    documentCode,
    documentCategory,
    departmentName,
    uploaderName,
    level,
    isRevision,
    revisionNumber,
    approvalId, // Pass approvalId for magic link target URL
    nextApproverName // Pass next approver name
  );
}

/**
 * Notify approvers about a batch of migrated documents
 */
async function notifyBatchApprovers(
  approverId,
  docs,
  documentCategory,
  departmentName,
  uploaderName,
  batchId // Added batchId
) {
  // Create one in-app notification summarizing the batch
  const docCount = docs.length;
  await createNotification({
    userId: approverId,
    type: "approval_pending",
    title: "Batch Document Approval Request",
    message: `You have ${docCount} migrated documents waiting for your approval.`,
    documentId: docs[0]?.documentId || null, // Best effort link
  });

  // Send email in background
  sendBatchApprovalEmails(
    approverId,
    docs,
    documentCategory,
    departmentName,
    uploaderName,
    batchId
  );
}

async function sendBatchApprovalEmails(
  approverId,
  docs,
  documentCategory,
  departmentName,
  uploaderName,
  batchId // Added batchId
) {
  try {
    const approver = await prisma.user.findUnique({
      where: { id: approverId },
      select: { id: true, email: true, fullName: true },
    });

    if (approver?.email) {
      await emailService.sendBatchApprovalRequestEmail({
        userId: approver.id,
        toEmail: approver.email,
        toName: approver.fullName,
        docs,
        uploaderName,
        documentCategory,
        departmentName,
        appUrl: getAppUrl(),
        batchId
      });
    }
  } catch (error) {
    console.error("Error sending batch approval emails:", error);
  }
}

/**
 * Helper to determine next approver(s) for email info
 */
async function getNextStepInfo(documentId, currentLevel, revision, category) {
  try {
    // 1. If Level 1 (QA), check if References exist
    if (currentLevel === 1) {
      // Check references for this revision
      // Note: We check if ANY references exist for this doc/revision
      // We do loose check on refs if specific revision refs don't exist yet (might be created in parallel)
      const refs = await prisma.document_reference_link.findMany({
        where: { documentId, documentRevision: revision },
        include: { reference: { include: { checker: true } } }
      });
      
      // Fallback if no specific revision refs found, try document generic
      const validRefs = refs.length > 0 ? refs : await prisma.document_reference_link.findMany({
        where: { documentId },
         include: { reference: { include: { checker: true } } }
      });

      if (validRefs.length > 0) {
         const names = validRefs
            .map(r => r.reference.checker?.fullName)
            .filter(Boolean);
         return names.length > 0 
            ? `${[...new Set(names)].join(", ")} (Reference Check)` 
            : "Reference Checkers"; 
      }
    }

    // 2. Check next hierarchy level
    // Need to fetch department hierarchies
    const doc = await prisma.document.findUnique({
        where: { id: documentId },
        select: { departmentId: true }
    });

    if (!doc) return "";

    const department = await prisma.department.findUnique({
        where: { id: doc.departmentId },
        include: {
            categoryHierarchies: {
                where: { isDeleted: false, category: category },
                include: { user: true }
            }
        }
    });

    if (!department) return "";

    // Map hierarchies: Config Level X -> Approval Level X+1 (Since QA is Level 1)
    const sortedHierarchies = (department.categoryHierarchies || [])
        .map(h => ({ ...h, level: h.level + 1 }))
        .sort((a, b) => a.level - b.level);

    // If current is Reference Check (effectively "1.5"), next is Level 2
    // But this function is seemingly only called for Hierarchy Approvals.
    // If current is Level 1, next is Level 2 (if exists).
    
    const nextLevel = currentLevel + 1;
    const nextStepConfig = sortedHierarchies.filter(h => h.level === nextLevel);

    if (nextStepConfig.length > 0) {
        const names = nextStepConfig.map(h => h.user.fullName);
        return `${[...new Set(names)].join(", ")} (Level ${nextLevel})`;
    }

    return "None (Final Approval)";

  } catch (error) {
    console.error("Error getting next step info:", error);
    return "";
  }
}

/**
 * Send approval emails to approvers (async, non-blocking)
 */
async function sendApprovalEmails(
  approverIds,
  documentId,
  documentName,
  documentCode,
  documentCategory,
  departmentName,
  uploaderName,
  level,
  isRevision,
  revisionNumber,
  approvalId, // Approval ID for magic link target URL
  nextApproverName // New parameter
) {
  try {
    // Get approver details
    const approvers = await prisma.user.findMany({
      where: { id: { in: approverIds } },
      select: { id: true, email: true, fullName: true },
    });

    const appUrl = getAppUrl();

    for (const approver of approvers) {
      if (!approver.email) continue;

      if (isRevision) {
        await emailService.sendRevisionRequestEmail({
          userId: approver.id, // For magic link
          toEmail: approver.email,
          toName: approver.fullName,
          documentName,
          documentCode,
          uploaderName,
          revisionNumber,
          appUrl,
          documentId: approvalId || documentId, // Use approvalId if available
          nextApproverName, // Pass to email service
        });
      } else {
        await emailService.sendApprovalRequestEmail({
          userId: approver.id, // For magic link
          toEmail: approver.email,
          toName: approver.fullName,
          documentName,
          documentCode,
          uploaderName,
          documentCategory,
          departmentName,
          revisionNumber,
          level,
          appUrl,
          documentId: approvalId || documentId, // Use approvalId if available
          nextApproverName, // Pass to email service
        });
      }
    }
  } catch (error) {
    console.error("Error sending approval emails:", error);
    // Don't throw - email failure shouldn't block notification
  }
}

/**
 * Notify document creator about approval (with email)
 */
async function notifyDocumentApproved(
  documentId,
  documentName,
  creatorId,
  approverName,
  options = {}
) {
  const { documentCode = "", level = 1, isFullyApproved = false, revision, category } = options;

  // Create in-app notification
  await createNotification({
    userId: creatorId,
    type: "document_approved",
    title: isFullyApproved ? "Document Fully Approved" : "Document Approved",
    message: `Your document "${documentName}" has been approved by ${approverName}.${
      isFullyApproved ? " All approvals completed!" : ""
    }`,
    documentId,
  });

  // Send email in background
  sendApprovedEmail(
    creatorId,
    documentId,
    documentName,
    documentCode,
    approverName,
    level,
    isFullyApproved,
    revision,
    category
  );
}

async function sendApprovedEmail(
  creatorId,
  documentId,
  documentName,
  documentCode,
  approverName,
  level,
  isFullyApproved,
  revision,
  category
) {
  try {
    const creator = await prisma.user.findUnique({
      where: { id: creatorId },
      select: { email: true, fullName: true },
    });

    if (creator?.email) {
      await emailService.sendDocumentApprovedEmail({
        userId: creatorId,
        toEmail: creator.email,
        toName: creator.fullName,
        documentName,
        documentCode,
        approverName,
        level,
        isFullyApproved,
        appUrl: getAppUrl(),
        documentId,
      });
    }

    // New Requirement: Automated email to IT if Level I or Level II is fully approved
    if (isFullyApproved && category) {
      const CATEGORY_LEVELS = {
        form: "III",
        standard: "III",
        instruksi_kerja: "III",
        prosedur: "II",
        manual_perusahaan: "I",
        manual_halal: "I",
        record: "III",
      };
      
      const docLevel = CATEGORY_LEVELS[category];
      if (docLevel === "I" || docLevel === "II") {
        await emailService.sendDocumentPublishedEmail({
          documentName,
          documentCode,
          revision,
          appUrl: getAppUrl(),
          documentId
        });
      }
    }
  } catch (error) {
    console.error("Error sending approved email:", error);
  }
}

/**
 * Notify document creator about rejection (with email)
 */
async function notifyDocumentRejected(
  documentId,
  documentName,
  creatorId,
  approverName,
  comments,
  options = {}
) {
  const { documentCode = "" } = options;

  // Create in-app notification
  await createNotification({
    userId: creatorId,
    type: "document_rejected",
    title: "Document Rejected",
    message: `Your document "${documentName}" has been rejected by ${approverName}. ${
      comments ? `Reason: ${comments}` : ""
    }`,
    documentId,
  });

  // Send email in background
  sendRejectedEmail(
    creatorId,
    documentId,
    documentName,
    documentCode,
    approverName,
    comments
  );
}

async function sendRejectedEmail(
  creatorId,
  documentId,
  documentName,
  documentCode,
  approverName,
  comments
) {
  try {
    const creator = await prisma.user.findUnique({
      where: { id: creatorId },
      select: { email: true, fullName: true },
    });

    if (creator?.email) {
      await emailService.sendDocumentRejectedEmail({
        userId: creatorId,
        toEmail: creator.email,
        toName: creator.fullName,
        documentName,
        documentCode,
        approverName,
        reason: comments,
        appUrl: getAppUrl(),
        documentId,
      });
    }
  } catch (error) {
    console.error("Error sending rejected email:", error);
  }
}

/**
 * Notify about document revision
 */
async function notifyDocumentRevised(documentId, documentName, userIds) {
  const notifications = userIds.map((userId) => ({
    userId,
    type: "document_revised",
    title: "Document Revised",
    message: `Document "${documentName}" has been revised and needs re-approval.`,
    documentId,
  }));

  return await createBulkNotifications(notifications);
}

/**
 * Notify reference checkers about document with their reference (with email)
 */
async function notifyReferenceCheckers(
  documentId,
  documentName,
  checkerData,
  options = {}
) {
  const { documentCode = "", uploaderName = "" } = options;

  // checkerData is array of { checkerId, referenceName }
  const notifications = checkerData.map(({ checkerId, referenceName }) => ({
    userId: checkerId,
    type: "reference_check_pending",
    title: "Reference Check Required",
    message: `Document "${documentName}" requires your check for reference: ${referenceName}.`,
    documentId,
  }));

  await createBulkNotifications(notifications);

  // Send emails in background
  sendReferenceCheckEmails(
    checkerData,
    documentId,
    documentName,
    documentCode,
    uploaderName
  );
}

async function sendReferenceCheckEmails(
  checkerData,
  documentId,
  documentName,
  documentCode,
  uploaderName
) {
  try {
    const checkerIds = checkerData.map((c) => c.checkerId);
    const checkers = await prisma.user.findMany({
      where: { id: { in: checkerIds } },
      select: { id: true, email: true, fullName: true },
    });

    const appUrl = getAppUrl();

    // Send emails in parallel
    await Promise.all(
      checkers.map(async (checker) => {
        if (!checker.email) return;

        // Find ALL references assigned to this checker
        const refsForChecker = checkerData.filter(
          (c) => c.checkerId === checker.id
        );

        // Send email for each reference
        await Promise.all(
          refsForChecker.map((refData) =>
            emailService.sendReferenceCheckEmail({
              userId: checker.id, // For magic link
              toEmail: checker.email,
              toName: checker.fullName,
              documentName,
              documentCode,
              referenceName: refData.referenceName,
              uploaderName,
              appUrl,
              documentId,
              referenceLinkId: refData.referenceLinkId, // Pass reference link ID for direct navigation
            })
          )
        );
      })
    );
  } catch (error) {
    console.error("Error sending reference check emails:", error);
  }
}

/**
 * Notify about print request (with email to QA)
 */
async function notifyPrintRequest(
  documentId,
  documentName,
  qaUserIds,
  options = {}
) {
  const { documentCode = "", requesterName = "", copies = 1, printRequestId } = options;

  const notifications = qaUserIds.map((userId) => ({
    userId,
    type: "print_request_pending",
    title: "Print Approval Request",
    message: `Document "${documentName}" print request (${copies} copies) needs your approval.`,
    documentId,
  }));

  await createBulkNotifications(notifications);

  // Send emails
  sendPrintRequestEmails(
    qaUserIds,
    documentId,
    documentName,
    documentCode,
    requesterName,
    copies,
    printRequestId // Pass print request ID
  );
}

async function sendPrintRequestEmails(
  qaUserIds,
  documentId,
  documentName,
  documentCode,
  requesterName,
  copies,
  printRequestId // Add printRequestId parameter
) {
  try {
    const users = await prisma.user.findMany({
      where: { id: { in: qaUserIds } },
      select: { id: true, email: true, fullName: true },
    });

    const appUrl = getAppUrl();

    for (const user of users) {
      if (!user.email) continue;

      await emailService.sendPrintApprovalEmail({
        userId: user.id, // For magic link
        toEmail: user.email,
        toName: user.fullName,
        documentName,
        documentCode,
        requesterName,
        copies,
        appUrl,
        printRequestId: printRequestId || documentId, // Fallback to documentId if not available
      });
    }
  } catch (error) {
    console.error("Error sending print request emails:", error);
  }
}

/**
 * Notify about deletion request (with email)
 */
async function notifyDeletionRequest(
  documentId,
  documentName,
  approverIds,
  options = {}
) {
  const { documentCode = "", requesterName = "", reason = "", approvalId } = options;

  const notifications = approverIds.map((userId) => ({
    userId,
    type: "deletion_request_pending",
    title: "Deletion Approval Request",
    message: `Document "${documentName}" deletion request needs your approval.`,
    documentId,
  }));

  await createBulkNotifications(notifications);

  // Send emails
  sendDeletionRequestEmails(
    approverIds,
    documentId,
    documentName,
    documentCode,
    requesterName,
    reason,
    approvalId // Pass approval ID
  );
}

async function sendDeletionRequestEmails(
  approverIds,
  documentId,
  documentName,
  documentCode,
  requesterName,
  reason,
  approvalId // Add approvalId parameter
) {
  try {
    const users = await prisma.user.findMany({
      where: { id: { in: approverIds } },
      select: { id: true, email: true, fullName: true },
    });

    const appUrl = getAppUrl();

    for (const user of users) {
      if (!user.email) continue;

      await emailService.sendDeletionApprovalEmail({
        userId: user.id, // For magic link
        toEmail: user.email,
        toName: user.fullName,
        documentName,
        documentCode,
        requesterName,
        reason,
        appUrl,
        approvalId: approvalId || documentId, // Fallback to documentId if not available
      });
    }
  } catch (error) {
    console.error("Error sending deletion request emails:", error);
  }
}

/**
 * Notify requester about fully approved deletion (with email)
 */
async function notifyDeletionFullyApproved(
  documentId,
  documentName,
  requesterId,
  approverName,
  options = {}
) {
  const { documentCode = "" } = options;

  // In-app notification is already handled in finalizeDocumentApproval, but we can do it here if needed.
  // Actually, wait, finalizeDocumentApproval creates its own notification. I'll just send the email from here to keep it modular.
  
  // Send email
  sendDeletionFullyApprovedEmailNotification(
    requesterId,
    documentId,
    documentName,
    documentCode,
    approverName
  );
}

async function sendDeletionFullyApprovedEmailNotification(
  requesterId,
  documentId,
  documentName,
  documentCode,
  approverName
) {
  try {
    const requester = await prisma.user.findUnique({
      where: { id: requesterId },
      select: { email: true, fullName: true },
    });

    if (requester?.email) {
      await emailService.sendDeletionFullyApprovedEmail({
        userId: requesterId,
        toEmail: requester.email,
        toName: requester.fullName,
        documentName,
        documentCode,
        approverName,
        appUrl: getAppUrl(),
        documentId,
      });
    }
  } catch (error) {
    console.error("Error sending deletion fully approved email:", error);
  }
}

/**
 * Notify requester that document is READY for pickup (with email)
 */
async function notifyPrintReady(
  documentId,
  documentName,
  requesterId,
  options = {}
) {
  const { documentCode = "" } = options;

  // Create in-app notification
  await createNotification({
    userId: requesterId,
    type: "print_ready",
    title: "Document Ready for Pickup",
    message: `Dokumen "${documentName}" sudah selesai dicetak dan siap diambil di QA.`,
    documentId,
  });

  // Send email
  sendPrintReadyEmailNotification(
    requesterId,
    documentId,
    documentName,
    documentCode
  );
}

async function sendPrintReadyEmailNotification(
  requesterId,
  documentId,
  documentName,
  documentCode
) {
  try {
    const requester = await prisma.user.findUnique({
      where: { id: requesterId },
      select: { email: true, fullName: true },
    });

    if (requester?.email) {
      await emailService.sendPrintRequestReadyEmail({
        toEmail: requester.email,
        toName: requester.fullName,
        documentName,
        documentCode,
        appUrl: getAppUrl(),
        documentId,
      });
    }
  } catch (error) {
    console.error("Error sending print ready email:", error);
  }
}

/**
 * Notify requester that print request is approved (with email)
 */
async function notifyPrintApproved(
  documentId,
  documentName,
  requesterId,
  approverName,
  options = {}
) {
  const { documentCode = "" } = options;

  // Create in-app notification
  await createNotification({
    userId: requesterId,
    type: "print_approved",
    title: "Print Request Approved",
    message: `Permintaan cetak dokumen "${documentName}" sudah disetujui oleh ${approverName}. Segera ambil di QA.`,
    documentId,
  });

  // Send email
  sendPrintApprovedEmailNotification(
    requesterId,
    documentId,
    documentName,
    documentCode,
    approverName
  );
}

async function sendPrintApprovedEmailNotification(
  requesterId,
  documentId,
  documentName,
  documentCode,
  approverName
) {
  try {
    const requester = await prisma.user.findUnique({
      where: { id: requesterId },
      select: { email: true, fullName: true },
    });

    if (requester?.email) {
      await emailService.sendPrintRequestApprovedEmail({
        toEmail: requester.email,
        toName: requester.fullName,
        documentName,
        documentCode,
        approverName,
        appUrl: getAppUrl(),
        documentId,
      });
    }
  } catch (error) {
    console.error("Error sending print approved email:", error);
  }
}

/**
 * Notify document creator about a batch of approved documents (consolidated email)
 */
async function notifyBatchDocumentApproved(
  creatorId,
  docs, // Array of { documentId, documentName, documentCode }
  approverName
) {
  // Create in-app notifications for each document (to keep history accurate)
  const notifications = docs.map(doc => ({
    userId: creatorId,
    type: "document_approved",
    title: "Document Fully Approved",
    message: `Your document "${doc.documentName}" has been fully approved by ${approverName}.`,
    documentId: doc.documentId,
  }));

  await createBulkNotifications(notifications);

  // Send ONE consolidated email in background
  sendBatchApprovedEmailNotification(
    creatorId,
    docs,
    approverName
  );
}

async function sendBatchApprovedEmailNotification(
  creatorId,
  docs,
  approverName
) {
  try {
    const creator = await prisma.user.findUnique({
      where: { id: creatorId },
      select: { email: true, fullName: true },
    });

    if (creator?.email) {
      await emailService.sendBatchDocumentApprovedEmail({
        userId: creatorId,
        toEmail: creator.email,
        toName: creator.fullName,
        docs,
        approverName,
        appUrl: getAppUrl(),
      });
    }
  } catch (error) {
    console.error("Error sending batch approved email:", error);
  }
}

/**
 * Notify approvers about new record (with email + magic link)
 */
async function notifyRecordApprovers(
  recordId,
  recordName,
  recordCategory,
  approverIds,
  options = {}
) {
  const {
    recordCode = "",
    departmentName = "",
    uploaderName = "",
    level = 1,
    approvalId, // Approval ID for per-approver magic link
  } = options;

  // Create in-app notifications
  // Note: notification.document_id has FK to `document` table — NOT `record_document`
  // So we pass null for documentId to avoid the foreign key constraint violation
  const notifications = approverIds.map((approverId) => ({
    userId: approverId,
    type: "record_approval_pending",
    title: "New Record Approval Request",
    message: `You have a new record "${recordName}" waiting for your approval.`,
    documentId: null, // Cannot reference record_document here — FK constraint is on `document` table
  }));

  await createBulkNotifications(notifications);

  // Send emails — awaited so any errors surface in logs
  await sendRecordApprovalEmails(
    approverIds,
    recordId,
    recordName,
    recordCode,
    recordCategory,
    departmentName,
    uploaderName,
    level,
    approvalId
  );
}

async function sendRecordApprovalEmails(
  approverIds,
  recordId,
  recordName,
  recordCode,
  recordCategory,
  departmentName,
  uploaderName,
  level,
  approvalId
) {
  try {
    console.log(`[Email] sendRecordApprovalEmails called for approverIds: ${JSON.stringify(approverIds)}`);

    const approvers = await prisma.user.findMany({
      where: { id: { in: approverIds } },
      select: { id: true, email: true, fullName: true },
    });

    console.log(`[Email] Found ${approvers.length} approvers:`, approvers.map(a => `${a.fullName} <${a.email}>`));

    const appUrl = getAppUrl();
    console.log(`[Email] appUrl: ${appUrl}`);

    for (const approver of approvers) {
      if (!approver.email) {
        console.warn(`[Email] Approver ${approver.fullName} (ID ${approver.id}) has no email address — skipping`);
        continue;
      }

      console.log(`[Email] Sending record approval email to ${approver.email}...`);
      const result = await emailService.sendRecordApprovalRequestEmail({
        userId: approver.id,
        toEmail: approver.email,
        toName: approver.fullName,
        recordName,
        recordCode,
        uploaderName,
        recordCategory,
        departmentName,
        level,
        appUrl,
        recordId, // Always use real record ID → /records/detail/:recordId
        nextApproverName: "",
      });
      console.log(`[Email] sendRecordApprovalRequestEmail result for ${approver.email}:`, result);
    }
  } catch (error) {
    console.error("[Email] Error in sendRecordApprovalEmails:", error);
  }
}


module.exports = {
  createNotification,
  createBulkNotifications,
  notifyApprovers,
  notifyBatchApprovers,
  notifyDocumentApproved,
  notifyBatchDocumentApproved,
  notifyDocumentRejected,
  notifyDocumentRevised,
  notifyReferenceCheckers,
  notifyPrintRequest,
  notifyDeletionRequest,
  notifyDeletionFullyApproved,
  notifyPrintApproved,
  notifyPrintReady,
  notifyRecordApprovers,
};
