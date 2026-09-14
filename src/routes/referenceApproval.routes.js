const express = require("express");
const router = express.Router();
const referenceApprovalController = require("../controllers/referenceApproval.controller");
const { verifyToken } = require("../middleware/auth");
const checkPermission = require("../middleware/checkPermission");

router.use(verifyToken);

// Get pending reference checks for the current user (checker)
router.get(
  "/",
  checkPermission("VIEW_DOCUMENTS"),
  referenceApprovalController.getReferenceChecks
);

// Approve a reference check
router.post(
  "/:id/approve",
  checkPermission("VIEW_DOCUMENTS"),
  referenceApprovalController.approve
);

// Reject a reference check
router.post(
  "/:id/reject",
  checkPermission("VIEW_DOCUMENTS"),
  referenceApprovalController.reject
);

module.exports = router;
