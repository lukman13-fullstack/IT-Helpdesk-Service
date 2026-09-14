const express = require("express");
const router = express.Router();
const departmentController = require("../controllers/department.controller");
const { verifyToken } = require("../middleware/auth");
const checkPermission = require("../middleware/checkPermission");
const {
  createDepartmentValidator,
  updateDepartmentValidator,
} = require("../validators/department.validator");

router.use(verifyToken);

router.get("/", departmentController.getAll);
router.post(
  "/add",
  checkPermission("MANAGE_DEPARTMENTS"),
  createDepartmentValidator,
  departmentController.create
);

// Category Hierarchy Routes - MUST come before /:id
router.get("/:id/category-hierarchies", departmentController.getCategoryHierarchies);
router.post(
  "/:id/category-hierarchies",
  checkPermission("MANAGE_DEPARTMENTS"),
  departmentController.saveCategoryHierarchy
);
router.delete(
  "/:id/category-hierarchies/:category",
  checkPermission("MANAGE_DEPARTMENTS"),
  departmentController.deleteCategoryHierarchy
);

// Specific /:id routes - put after sub-routes
router.get("/:id", departmentController.getById);
router.put(
  "/:id",
  checkPermission("MANAGE_DEPARTMENTS"),
  updateDepartmentValidator,
  departmentController.update
);
router.delete(
  "/:id",
  checkPermission("MANAGE_DEPARTMENTS"),
  departmentController.delete
);

module.exports = router;

