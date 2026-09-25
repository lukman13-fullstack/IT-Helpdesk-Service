const express = require("express");
const router = express.Router();
const ticketCategoryController = require("../controllers/ticketCategory.controller");
const { verifyToken } = require("../middleware/auth");

router.use(verifyToken);

router.get("/", ticketCategoryController.getAll);
router.post("/", ticketCategoryController.create);
router.get("/:id", ticketCategoryController.getById);
router.put("/:id", ticketCategoryController.update);
router.delete("/:id", ticketCategoryController.delete);

module.exports = router;
