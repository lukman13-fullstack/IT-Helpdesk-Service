const express = require("express");
const router = express.Router();
const documentReferenceController = require("../controllers/documentReference.controller");
const { verifyToken } = require("../middleware/auth");
const checkPermission = require("../middleware/checkPermission");

router.use(verifyToken);

// Get all references (with optional pagination, or all for dropdowns)
router.get(
  "/",
  checkPermission("VIEW_DOCUMENTS"),
  documentReferenceController.getAll
);

// Get reference by ID
router.get(
  "/:id",
  checkPermission("VIEW_DOCUMENTS"),
  documentReferenceController.getById
);

// Create new reference
router.post(
  "/add",
  checkPermission("MANAGE_REFERENCES"),
  documentReferenceController.create
);

// Update reference
router.put(
  "/:id",
  checkPermission("MANAGE_REFERENCES"),
  documentReferenceController.update
);

// Delete reference
router.delete(
  "/:id",
  checkPermission("MANAGE_REFERENCES"),
  documentReferenceController.delete
);

module.exports = router;

