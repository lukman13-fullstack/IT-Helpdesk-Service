const getReferenceChecksHandler = require("../handlers/referenceApproval/getReferenceChecks.handler");
const approveReferenceCheckHandler = require("../handlers/referenceApproval/approveReferenceCheck.handler");
const rejectReferenceCheckHandler = require("../handlers/referenceApproval/rejectReferenceCheck.handler");

const referenceApprovalController = {
  getReferenceChecks: getReferenceChecksHandler,
  approve: approveReferenceCheckHandler,
  reject: rejectReferenceCheckHandler,
};

module.exports = referenceApprovalController;
