const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");
const logController = require("../controllers/log.controller");

router.use(verifyToken);

router.get("/", logController.getAllLogs);

module.exports = router;
