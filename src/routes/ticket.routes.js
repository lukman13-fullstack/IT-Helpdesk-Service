const express = require("express");
const router = express.Router();
const ticketController = require("../controllers/ticket.controller");
const { verifyToken } = require("../middleware/auth");

router.use(verifyToken);

router.get("/", ticketController.getAll);
router.post("/", ticketController.create);
router.get("/:id", ticketController.getById);
router.put("/:id", ticketController.update);
router.delete("/:id", ticketController.delete);

// Comment routes
router.post("/:id/comments", ticketController.addComment);

module.exports = router;
