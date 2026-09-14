const express = require("express");
const router = express.Router();

const authRoutes = require("./auth.routes");
const userRoutes = require("./user.routes");
const departmentRoutes = require("./department.routes");
const documentRoutes = require("./document.routes");
const digitalApprovalRoutes = require("./digitalApproval.routes");
const logRoutes = require("./log.routes");
const roleRoutes = require("./role.routes");
const notificationRoutes = require("./notification.routes");
const documentReferenceRoutes = require("./documentReference.routes");
const referenceApprovalRoutes = require("./referenceApproval.routes");
const dashboardRoutes = require("./dashboard.routes");
const draftRoutes = require("./draft.route");
const translateRoutes = require("./translate.routes");

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/departments", departmentRoutes);
router.use("/documents", documentRoutes);
router.use("/approvals", digitalApprovalRoutes);
router.use("/logs", logRoutes);
router.use("/roles", roleRoutes);
router.use("/notifications", notificationRoutes);
router.use("/references", documentReferenceRoutes);
router.use("/reference-approvals", referenceApprovalRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/drafts", draftRoutes);
router.use("/translate", translateRoutes);

module.exports = router;
