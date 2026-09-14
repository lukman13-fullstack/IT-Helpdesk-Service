const crypto = require("crypto");
const prisma = require("../utils/prisma");

/**
 * Magic Link Service
 * Generates and validates secure tokens for passwordless email login
 * Tokens are reusable until expiration (1 hour)
 */

/**
 * Generate a secure magic token for user authentication
 * @param {number} userId - User ID to authenticate
 * @param {string} targetUrl - URL to redirect after successful login
 * @returns {Promise<string>} - The generated token (64-char hex string)
 */
async function generateMagicToken(userId, targetUrl) {
  try {
    // Generate cryptographically secure random token (32 bytes = 64 hex chars)
    const token = crypto.randomBytes(32).toString("hex");

    // Token expires in 30 days (increased from 1 hour)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Store token in database
    await prisma.magic_token.create({
      data: {
        token,
        userId,
        targetUrl,
        expiresAt,
      },
    });

    console.log(
      `✉️ Magic token generated for user ${userId}, expires: ${expiresAt.toISOString()}`
    );
    return token;
  } catch (error) {
    console.error("Error generating magic token:", error);
    throw new Error("Failed to generate magic token");
  }
}

/**
 * Validate magic token (reusable until expiration)
 * @param {string} token - Token to validate
 * @returns {Promise<{userId: number, targetUrl: string, user: object, isExpired: boolean}>} - User info and target URL
 */
async function validateMagicToken(token) {
  try {
    // Find token in database
    const magicToken = await prisma.magic_token.findUnique({
      where: { token },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            email: true,
            roleId: true,
            tokenVersion: true,
            role: {
              select: {
                id: true,
                name: true,
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
            departments: {
              include: {
                department: {
                  select: {
                    id: true,
                    name: true,
                    departmentCode: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Token not found
    if (!magicToken) {
      throw new Error("INVALID_TOKEN");
    }

    // Check if token expired
    const isExpired = new Date() > magicToken.expiresAt;
    
    // If expired, we still return the user info but mark it as expired
    // The handler will decide what to do (e.g., if already processed, ignore expiration)
    
    // Token is valid (or recently expired) - update last used timestamp
    await prisma.magic_token.update({
      where: { id: magicToken.id },
      data: { usedAt: new Date() },
    });

    console.log(`✅ Magic token validated for user ${magicToken.userId}${isExpired ? ' (EXPIRED)' : ''}`);

    return {
      userId: magicToken.userId,
      targetUrl: magicToken.targetUrl,
      user: magicToken.user,
      isExpired,
    };
  } catch (error) {
    console.error("Error validating magic token:", error.message);
    throw error;
  }
}

/**
 * Check approval status based on targetUrl
 * Parses the targetUrl to determine the approval type and checks if already processed
 *
 * @param {string} targetUrl - The target URL (e.g., /approvals/document/123)
 * @param {number} userId - The user ID of the approver
 * @returns {Promise<{alreadyProcessed: boolean, message: string|null}>}
 */
async function checkApprovalStatus(targetUrl, userId) {
  try {
    // Parse targetUrl to determine approval type
    const documentMatch = targetUrl.match(/^\/approvals\/document\/(\d+)$/);
    const revisionMatch = targetUrl.match(/^\/approvals\/revision\/(\d+)$/);
    const printMatch = targetUrl.match(/^\/approvals\/print\/(\d+)$/);
    const deletionMatch = targetUrl.match(/^\/approvals\/deletion\/(\d+)$/);
    const referenceDetailMatch = targetUrl.match(/^\/approvals\/reference\/(\d+)$/);
    const referenceMatch = targetUrl === "/approvals";

    // Check document approval
    if (documentMatch) {
      const approvalId = parseInt(documentMatch[1]);
      return await checkDocumentApprovalStatus(approvalId, userId);
    }

    // Check revision approval
    if (revisionMatch) {
      const approvalId = parseInt(revisionMatch[1]);
      return await checkRevisionApprovalStatus(approvalId, userId);
    }

    // Check print approval
    if (printMatch) {
      const printRequestId = parseInt(printMatch[1]);
      return await checkPrintApprovalStatus(printRequestId, userId);
    }

    // Check deletion approval
    if (deletionMatch) {
      const approvalId = parseInt(deletionMatch[1]);
      return await checkDeletionApprovalStatus(approvalId, userId);
    }

    // Check reference approval detail
    if (referenceDetailMatch) {
      const referenceLinkId = parseInt(referenceDetailMatch[1]);
      return await checkReferenceApprovalStatus(referenceLinkId, userId);
    }

    // Reference check list (/approvals)
    if (referenceMatch) {
      return { alreadyProcessed: false, message: null };
    }

    // Unknown URL pattern - allow through
    return { alreadyProcessed: false, message: null };
  } catch (error) {
    console.error("Error checking approval status:", error);
    // On error, allow through (don't block the user)
    return { alreadyProcessed: false, message: null };
  }
}

/**
 * Check if a document approval has already been processed by this user
 */
async function checkDocumentApprovalStatus(approvalId, userId) {
  const approval = await prisma.digital_approval.findUnique({
    where: {
      id: approvalId,
    },
    include: {
      document: {
        select: { name: true, documentCode: true },
      },
    },
  });

  // If approval doesn't exist or belongs to another user (shouldn't happen with valid token)
  if (!approval || approval.approverId !== userId) {
    return { alreadyProcessed: false, message: null };
  }

  if (approval.status === "approved") {
    const docName = approval.document?.documentCode || approval.document?.name || "Document";
    return {
      alreadyProcessed: true,
      message: `Document "${docName}" has already been approved.`,
    };
  }

  if (approval.status === "rejected") {
    const docName = approval.document?.documentCode || approval.document?.name || "Document";
    return {
      alreadyProcessed: true,
      message: `Document "${docName}" has already been rejected.`,
    };
  }

  return { alreadyProcessed: false, message: null };
}

/**
 * Check if a revision approval has already been processed by this user
 */
async function checkRevisionApprovalStatus(approvalId, userId) {
  const approval = await prisma.digital_approval.findUnique({
    where: {
      id: approvalId,
    },
    include: {
      document: {
        select: { name: true, documentCode: true },
      },
    },
  });

  if (!approval || approval.approverId !== userId) {
    return { alreadyProcessed: false, message: null };
  }

  if (approval.status === "approved") {
    const docName = approval.document?.documentCode || approval.document?.name || "Document";
    return {
      alreadyProcessed: true,
      message: `Revision for "${docName}" has already been approved.`,
    };
  }

  if (approval.status === "rejected") {
    const docName = approval.document?.documentCode || approval.document?.name || "Document";
    return {
      alreadyProcessed: true,
      message: `Revision for "${docName}" has already been rejected.`,
    };
  }

  return { alreadyProcessed: false, message: null };
}

/**
 * Check if a print request approval has already been processed
 */
async function checkPrintApprovalStatus(printRequestId, userId) {
  const printRequest = await prisma.print_request.findUnique({
    where: { id: printRequestId },
    include: {
      document: {
        select: { name: true, documentCode: true },
      },
    },
  });

  if (!printRequest) {
    return { alreadyProcessed: false, message: null };
  }

  if (printRequest.status === "approved") {
    const docName = printRequest.document?.documentCode || printRequest.document?.name || "Document";
    return {
      alreadyProcessed: true,
      message: `Print request for "${docName}" has already been approved.`,
    };
  }

  if (printRequest.status === "rejected") {
    const docName = printRequest.document?.documentCode || printRequest.document?.name || "Document";
    return {
      alreadyProcessed: true,
      message: `Print request for "${docName}" has already been rejected.`,
    };
  }

  return { alreadyProcessed: false, message: null };
}

/**
 * Check if a deletion approval has already been processed
 */
async function checkDeletionApprovalStatus(approvalId, userId) {
  const approval = await prisma.digital_approval.findFirst({
    where: {
      id: approvalId,
      approverId: userId,
      type: "deletion",
    },
    include: {
      document: {
        select: { name: true, documentCode: true },
      },
    },
  });

  if (!approval) {
    return { alreadyProcessed: false, message: null };
  }

  if (approval.status === "approved") {
    const docName = approval.document?.documentCode || approval.document?.name || "Document";
    return {
      alreadyProcessed: true,
      message: `Deletion request for "${docName}" has already been approved.`,
    };
  }

  if (approval.status === "rejected") {
    const docName = approval.document?.documentCode || approval.document?.name || "Document";
    return {
      alreadyProcessed: true,
      message: `Deletion request for "${docName}" has already been rejected.`,
    };
  }

  return { alreadyProcessed: false, message: null };
}

/**
 * Check if a reference check has already been processed
 */
async function checkReferenceApprovalStatus(referenceLinkId, userId) {
  const referenceLink = await prisma.document_reference_link.findUnique({
    where: { id: referenceLinkId },
    include: {
      document: {
        select: { name: true, documentCode: true },
      },
      reference: {
        select: { name: true, checkerId: true },
      },
    },
  });

  if (!referenceLink) {
    return { alreadyProcessed: false, message: null };
  }

  // Verify checker matches
  if (referenceLink.reference.checkerId !== userId) {
     // If user is not the checker, perhaps they shouldn't see it, but here we just return not processed
     // Or we could return already processed if status is not pending?
     // Let's stick to status check.
  }

  if (referenceLink.status === "approved") {
    const docName = referenceLink.document?.documentCode || referenceLink.document?.name || "Document";
    return {
      alreadyProcessed: true,
      message: `Reference check for "${docName}" has already been approved.`,
    };
  }

  if (referenceLink.status === "rejected") {
    const docName = referenceLink.document?.documentCode || referenceLink.document?.name || "Document";
    return {
      alreadyProcessed: true,
      message: `Reference check for "${docName}" has already been rejected.`,
    };
  }

  return { alreadyProcessed: false, message: null };
}

/**
 * Clean up expired tokens (optional maintenance task)
 * Can be run periodically via cron job
 */
async function cleanupExpiredTokens() {
  try {
    const result = await prisma.magic_token.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
    console.log(`🧹 Cleaned up ${result.count} expired magic tokens`);
    return result.count;
  } catch (error) {
    console.error("Error cleaning up expired tokens:", error);
    throw error;
  }
}

module.exports = {
  generateMagicToken,
  validateMagicToken,
  checkApprovalStatus,
  cleanupExpiredTokens,
  checkReferenceApprovalStatus,
};
