const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");
const getNotificationsHandler = require("../handlers/notification/getNotifications.handler");
const markNotificationAsReadHandler = require("../handlers/notification/markNotificationAsRead.handler");
const markAllNotificationsAsReadHandler = require("../handlers/notification/markAllNotificationsAsRead.handler");

router.get("/", verifyToken, getNotificationsHandler);
router.patch("/:id/read", verifyToken, markNotificationAsReadHandler);
router.patch("/read-all", verifyToken, markAllNotificationsAsReadHandler);

module.exports = router;
