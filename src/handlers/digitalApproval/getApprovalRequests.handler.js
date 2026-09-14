const prisma = require("../../utils/prisma");

/**
 * Get approval requests for the current user
 * - Only shows approvals where previous hierarchy levels are already approved
 * - Also includes reference checks where user is the checker
 */
async function getApprovalRequests(req, res) {
  try {
    const userId = req.user.id;
    const { status = "pending", page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Get digital approvals
    let digitalApprovals = [];

    if (status === "pending") {
      // For pending status, we need to filter by hierarchy
      digitalApprovals = await getReadyApprovals(userId, skip, take);
    } else if (status === "all") {
      // For "all" status, show everything assigned to this user
      digitalApprovals = await prisma.digital_approval.findMany({
        where: { approverId: userId },
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: getApprovalIncludes(),
      });
    } else {
      // For specific status (approved, rejected)
      digitalApprovals = await prisma.digital_approval.findMany({
        where: { approverId: userId, status },
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: getApprovalIncludes(),
      });
    }

    // Get reference checks
    const referenceChecks = await getReferenceChecks(userId, status);

    // Map digital approvals with reason fallback
    const digitalApprovalData = digitalApprovals.map((approval) => {
      let reason = approval.reason;
      
      // Fallback: If no reason and it's a New Doc approval (Rev 0), use proposalObjective
      if (!reason && approval.type === "approval" && approval.documentRevision === 0 && approval.document?.proposalObjective) {
        reason = approval.document.proposalObjective;
      }
      
      return {
        ...approval,
        createdByName: approval.creator ? approval.creator.fullName : null,
        reason: reason || null, // Standardized reason
      };
    });

    // Map reference checks to approval format (include canAct flag from backend)
    const referenceCheckData = referenceChecks.map((refCheck) => ({
      id: `ref-${refCheck.id}`,
      originalId: refCheck.id,
      type: "Reference Check",
      isReferenceCheck: true,
      status: refCheck.status,
      createdAt: refCheck.createdAt,
      document: refCheck.document,
      creator: refCheck.document.uploader,
      reference: refCheck.reference,
      comments: refCheck.comments,
      reason: refCheck.reason, // Include extracted reason
      canAct: refCheck.canAct, // Flag: can user approve/reject this?
      hasPendingHierarchy: refCheck.hasPendingHierarchy, // Flag: user has pending hierarchy approval
      documentRevision: refCheck.documentRevision || 0,
      checker: refCheck.checker,
    }));

    // Combine and sort by createdAt desc
    const combinedData = [...digitalApprovalData, ...referenceCheckData];
    combinedData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const total = digitalApprovals.length + referenceChecks.length;

    return res.status(200).json({
      success: true,
      data: combinedData,
      pagination: {
        page: parseInt(page),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    console.error("Error getting approval requests:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get approval requests",
    });
  }
}

/**
 * Get approvals that are ready to be acted on (previous levels approved)
 */
async function getReadyApprovals(userId, skip, take) {
  // First get all pending approvals for this user with their document's full approval chain
  const pendingApprovals = await prisma.digital_approval.findMany({
    where: {
      approverId: userId,
      status: "pending",
    },
    include: {
      document: {
        include: {
          approvals: {
            orderBy: { level: "asc" },
          },
          references: true, // Include references for checking approval status
        },
      },
      printRequest: {
        include: {
          requester: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
      },
    },
  });

  // Filter to only include approvals that are "ready" (all previous levels approved)
  const readyApprovals = pendingApprovals.filter((approval) => {
    // Skip if document is rejected or obsolete
    if (
      approval.document.status === "rejected" ||
      approval.document.status === "obsolete"
    ) {
      return false;
    }

    // Print and Deletion approvals are always ready (single-approval system)
    // Any approver can act on them immediately
    if (approval.type === "print" || approval.type === "deletion") {
      return true;
    }

    // Level 1 approvals are always ready (first step in progressive flow)
    // Flow: Level 1 → References → Level 2 → Level 3 ...
    if (approval.level === 1) {
      return true;
    }

    // Get previous levels of the SAME type (approval, deletion, etc.)
    const previousLevels = approval.document.approvals.filter(
      (a) => a.level < approval.level && a.type === approval.type
    );

    // If there are no previous levels recorded, not ready (data inconsistency)
    if (previousLevels.length === 0) {
      return false;
    }

    // Check if any previous level is rejected
    const hasRejection = previousLevels.some((a) => a.status === "rejected");
    if (hasRejection) {
      return false;
    }

    // Check if all previous levels are approved
    const allPreviousApproved = previousLevels.every(
      (a) => a.status === "approved"
    );
    if (!allPreviousApproved) {
      return false;
    }

    // For Level 2+: Check if ALL references are approved (if any exist)
    // Flow: Level 1 -> References -> Level 2+
    if (approval.level >= 2 && approval.document.references?.length > 0) {
      const allReferencesApproved = approval.document.references.every(
        (ref) => ref.status === "approved"
      );
      if (!allReferencesApproved) {
        return false; // Wait for all references to be approved first
      }
    }

    return true;
  });

  // Get the full approval details for ready approvals
  const readyApprovalIds = readyApprovals.map((a) => a.id);

  if (readyApprovalIds.length === 0) {
    return [];
  }

  return prisma.digital_approval.findMany({
    where: { id: { in: readyApprovalIds } },
    skip,
    take,
    orderBy: { createdAt: "desc" },
    include: getApprovalIncludes(),
  });
}

/**
 * Get reference checks for user (as checker)
 * Shows reference checks when user's turn in hierarchy arrives
 * Includes a flag indicating if the user can act on it (hierarchy already approved)
 */
async function getReferenceChecks(userId, status) {
  try {
    const where = {
      reference: {
        checkerId: userId,
        isActive: true,
      },
    };

    // Add status filter if not "all"
    if (status !== "all") {
      where.status = status || "pending";
    }

    const referenceChecks = await prisma.document_reference_link.findMany({
      where,
      include: {
        document: {
          select: {
            id: true,
            name: true,
            documentCode: true,
            category: true,
            status: true,
            proposalObjective: true,
            uploader: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
            department: {
              select: {
                id: true,
                name: true,
                departmentCode: true,
              },
            },
            // Include approvals to check hierarchy
            approvals: {
              orderBy: { level: "asc" },
              select: {
                id: true,
                level: true,
                type: true,
                status: true,
                approverId: true,
                reason: true, // Include reason to show Revision Purpose in reference checks
                documentRevision: true,
                createdAt: true, // Needed for sorting
              },
            },
          },
        },
        reference: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        checker: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Process each reference check to add visibility and action flags
    const processedReferenceChecks = referenceChecks.map((refCheck) => {
      // Sort approvals by createdAt desc to ensure we get the latest revision info
      const approvals = (refCheck.document.approvals || []).sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );

      // Find if the checker (userId) has any approval role for this document
      // NOTE: Do NOT filter by documentRevision here - we need to check ALL approvals for visibility
      const userApproval = approvals.find(
        (a) => a.approverId === userId && (a.type === "approval" || a.type === "revision")
      );

      // Default: can see and act
      let canSee = true;
      let canAct = true;
      let hasPendingHierarchy = false;

      // PROGRESSIVE FLOW: References ALWAYS wait for Level 1 to approve
      // Flow: Level 1 → References → Level 2 → Level 3 ...
      // NOTE: Check ALL Level 1 approvals (not filtered by revision) for visibility
      const level1Approvals = approvals.filter(
        (a) => a.level === 1 && (a.type === "approval" || a.type === "revision")
      );
      const level1AllApproved =
        level1Approvals.length > 0 &&
        level1Approvals.every((a) => a.status === "approved");

      // If Level 1 is not yet approved, reference check is not ready
      if (!level1AllApproved && level1Approvals.length > 0) {
        canSee = false;
        canAct = false;
        return {
          ...refCheck,
          canSee,
          canAct,
          hasPendingHierarchy: true, // Level 1 pending
        };
      }

      if (userApproval) {
        // User is also an approver for this document
        if (userApproval.status === "pending") {
          hasPendingHierarchy = true;

          // Check if all previous levels are approved
          const previousLevels = approvals.filter(
            (a) => a.level < userApproval.level && (a.type === "approval" || a.type === "revision")
          );

          const allPreviousApproved =
            previousLevels.length === 0 ||
            previousLevels.every((a) => a.status === "approved");

          if (allPreviousApproved) {
            // User's turn in hierarchy - show reference check but cannot act yet
            canSee = true;
            canAct = false; // Must approve hierarchy first
          } else {
            // Not user's turn yet - don't show reference check
            canSee = false;
            canAct = false;
          }
        } else {
          // User already approved/rejected hierarchy - can act on reference check
          canAct = true;
        }
      }

      // Find reason from Level 1 approval that MATCHES this reference check's documentRevision
      // This ensures we get the correct reason for each revision (e.g., Rev 01 gets Rev 01's reason)
      const refCheckDocRev = Number(refCheck.documentRevision ?? 0);
      
      const level1Approval = approvals.find(
        (a) =>
          a.level === 1 &&
          (a.type === "approval" || a.type === "revision") &&
          Number(a.documentRevision ?? 0) === refCheckDocRev
      );

      let reason = level1Approval?.reason || null;

      // Fallback: If no reason in approval (e.g. New Doc), use proposalObjective
      if (!reason && refCheck.document.proposalObjective) {
        reason = refCheck.document.proposalObjective;
      }

      return {
        ...refCheck,
        reason, // Extract reason or fallback
        canSee,
        canAct,
        hasPendingHierarchy,
      };
    });

    // Filter to only show visible reference checks
    return processedReferenceChecks.filter((rc) => rc.canSee);
  } catch (error) {
    console.log("Reference checks not available:", error.message);
    return [];
  }
}

/**
 * Standard includes for approval queries
 */
function getApprovalIncludes() {
  return {
    document: {
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
    approver: {
      select: {
        id: true,
        fullName: true,
        email: true,
      },
    },
    approvedByUser: {
      select: {
        id: true,
        fullName: true,
      },
    },
    creator: {
      select: {
        id: true,
        fullName: true,
      },
    },
    printRequest: {
      include: {
        requester: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    },
  };
}

module.exports = getApprovalRequests;
