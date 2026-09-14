const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");
const checkPermission = require("../middleware/checkPermission");

const getApprovalRequests = require("../handlers/digitalApproval/getApprovalRequests.handler");
const { approveDocumentHandler } = require("../handlers/digitalApproval/approveDocument.handler");
const { approveBatchDocumentsHandler } = require("../handlers/digitalApproval/approveBatchDocuments.handler");
const rejectDocument = require("../handlers/digitalApproval/rejectDocument.handler");

router.use(verifyToken);


router.get("/requests", getApprovalRequests);
router.get("/:id/detail", require("../handlers/digitalApproval/getApprovalDetail.handler"));
router.get("/reference/:id/detail", require("../handlers/referenceCheck/getReferenceApprovalDetail.handler"));

router.get(
  "/pending",
  (req, res, next) => {
    req.query.status = "pending";
    next();
  },
  getApprovalRequests
);

router.post(
  "/:id/approve",
  checkPermission("APPROVE_DOCUMENT"),
  approveDocumentHandler
);

router.post(
  "/batch-approve",
  checkPermission("APPROVE_DOCUMENT"),
  approveBatchDocumentsHandler
);

router.post("/:id/reject", checkPermission("APPROVE_DOCUMENT"), rejectDocument);

module.exports = router;
