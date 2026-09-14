/**
 * Calculate approval progress for a document
 * @param {Object} doc - Document object with approvals, references, and department.categoryHierarchies
 * @returns {Object} Progress object with percentage and steps
 */
function calculateApprovalProgress(doc) {
  if (!doc) return null;

  const steps = [];
  const currentRevision = doc.revision || 0;
  
  // Filter approvals for current revision only
  const approvals = (doc.approvals || []).filter(
    (a) => a.documentRevision === currentRevision
  );
  
  // Filter references for current revision only
  const references = (doc.references || []).filter(
    (r) => r.documentRevision === currentRevision
  );

  const categoryHierarchies = (doc.department?.categoryHierarchies || []).filter(
    (h) => h.category === doc.category
  );

  // Step A: QA Level 1
  const qaApprovals = approvals.filter(
    (a) => a.level === 1 && a.type !== "deletion"
  );
  
  // If approved, only show the one who actually approved
  const approvedQa = qaApprovals.filter(a => a.status === 'approved');
  let qaStatus = "pending";
  if (approvedQa.length > 0) {
    qaStatus = "approved";
  } else if (qaApprovals.some((a) => a.status === "rejected")) {
    qaStatus = "rejected";
  } else if (['approved', 'obsolete'].includes(doc.status)) {
    // If doc is finished but no Level 1 records exist, it was either migrated or early-approved
    qaStatus = "approved";
  }

  steps.push({
    id: "qa-1",
    title: "Checked by QA Team",
    approverName: (approvedQa.length > 0 ? approvedQa : qaApprovals)
      .map((a) => a.approver.fullName)
      .join(", ") || "QA Team",
    status: qaStatus,
    isMandatory: true,
  });

  // Step B: References
  // EXEMPTION: Skip for 'form' category
  if (doc.category !== "form" && references.length > 0) {
    const refsApproved = references.length === 0 || references.every((r) => r.status === "approved");
    const refsRejected = references.some((r) => r.status === "rejected");
    
    let refStatus = "pending";
    
    if (qaStatus !== "approved") {
      refStatus = "waiting";
    } else {
      if (refsApproved) refStatus = "approved";
      else if (refsRejected) refStatus = "rejected";
      else if (['approved', 'obsolete'].includes(doc.status)) refStatus = "approved";
    }

    steps.push({
      id: "refs",
      title: "Reference Approve",
      approverName: references.length > 0 
        ? references.map((r) => r.checker?.fullName || r.reference?.checker?.fullName || "Checker").join(", ")
        : "Reference Checkers",
      status: refStatus,
      isMandatory: true,
    });
  }

  // Step C: Department Hierarchy (Level 2+)
  // Priority: 1. Category-specific hierarchy, 2. General department hierarchy
  let effectiveHierarchies = [];
  if (categoryHierarchies.length > 0) {
    effectiveHierarchies = categoryHierarchies;
  } else {
    // Only fallback to general if NO category-specific settings exist for THIS category
    effectiveHierarchies = doc.department?.hierarchies || [];
  }

  effectiveHierarchies.sort((a, b) => a.level - b.level);
  effectiveHierarchies.forEach((h) => {
    // Map hierarchy level X to doc approval level X+1
    const targetLevel = h.level + 1;
    const levelApprovals = approvals.filter(
      (a) => a.level === targetLevel && a.type !== "deletion"
    );

    // Only include this hierarchy level if the document actually has
    // approval records for it. This prevents hierarchy changes (e.g. adding
    // Level 2) from retroactively affecting old documents that were created
    // before the hierarchy was updated.
    // Only include this hierarchy level if the document actually has
    // approval records for it OR if it's an ongoing document (draft, pending, review).
    // This prevents hierarchy changes from retroactively affecting completed old documents.
    if (levelApprovals.length === 0) {
      if (['approved', 'rejected', 'obsolete'].includes(doc.status)) {
        return;
      }
      // Future step for an active document
      steps.push({
        id: `lvl-${h.level}`,
        title: `Lvl ${h.level}`,
        approverName: h.user?.fullName || "Approver",
        status: "waiting",
        isMandatory: true,
      });
      return;
    }

    // If approved, only show who approved
    const approvedLvl = levelApprovals.filter(a => a.status === 'approved');
    let lvlStatus = "pending";
    if (approvedLvl.length > 0) {
      lvlStatus = "approved";
    } else if (levelApprovals.some((a) => a.status === "rejected")) {
      lvlStatus = "rejected";
    } else if (['approved', 'obsolete'].includes(doc.status)) {
      lvlStatus = "approved";
    }

    steps.push({
      id: `lvl-${h.level}`,
      title: `Lvl ${h.level}`,
      approverName:
        approvedLvl.length > 0
          ? approvedLvl.map((a) => a.approver.fullName).join(", ")
          : levelApprovals.length > 0
          ? levelApprovals.map((a) => a.approver.fullName).join(", ")
          : h.user?.fullName || "Approver",
      status: lvlStatus,
      isMandatory: true,
    });
  });

  // 2. Calculate Percentage
  const completedSteps = steps.filter((s) => s.status === "approved").length;
  const totalSteps = steps.length;
  
  // If document is fully approved, force 100%
  // REMOVED: Force 100% logic to support Early Publishing (Progressive Approval)
  // if (doc.status === 'approved') { ... }

  const percentage =
    totalSteps > 0
      ? Math.round((completedSteps / totalSteps) * 100)
      : doc.status === "approved"
      ? 100
      : 0;

  return {
    percentage,
    completedSteps,
    totalSteps,
    steps,
  };
}

module.exports = { calculateApprovalProgress };
