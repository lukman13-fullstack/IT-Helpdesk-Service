const express = require("express");
const router = express.Router();

const authRoutes = require("./auth.routes");
const userRoutes = require("./user.routes");
const departmentRoutes = require("./department.routes");
const roleRoutes = require("./role.routes");
const ticketCategoryRoutes = require("./ticketCategory.routes");
const ticketRoutes = require("./ticket.routes");
const logRoutes = require("./log.routes");
const notificationRoutes = require("./notification.routes");
const dashboardRoutes = require("./dashboard.routes");

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/departments", departmentRoutes);
router.use("/roles", roleRoutes);
router.use("/ticket-categories", ticketCategoryRoutes);
router.use("/tickets", ticketRoutes);
router.use("/logs", logRoutes);
router.use("/notifications", notificationRoutes);
router.use("/dashboard", dashboardRoutes);

module.exports = router;
