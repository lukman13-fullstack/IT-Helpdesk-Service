const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notification.controller");
const { verifyToken } = require("../middleware/auth");

router.use(verifyToken);
router.get("/", notificationController.getAll);
router.put("/:id/read", notificationController.markAsRead);

module.exports = router;
