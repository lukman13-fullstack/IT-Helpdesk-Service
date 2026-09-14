const express = require("express");
const router = express.Router();
const roleController = require("../controllers/role.controller");
const { verifyToken } = require("../middleware/auth");
const checkPermission = require("../middleware/checkPermission");
const {
  createRoleValidator,
  updateRoleValidator,
} = require("../validators/role.validator");

router.use(verifyToken);

router.get(
  "/permissions",
  checkPermission("MANAGE_ROLES"),
  roleController.getAllPermissions
);

router.get("/", checkPermission("MANAGE_ROLES"), roleController.getAll);

router.get("/:id", checkPermission("MANAGE_ROLES"), roleController.getById);

router.post(
  "/add",
  checkPermission("MANAGE_ROLES"),
  createRoleValidator,
  roleController.create
);

router.put(
  "/:id",
  checkPermission("MANAGE_ROLES"),
  updateRoleValidator,
  roleController.update
);

router.delete("/:id", checkPermission("MANAGE_ROLES"), roleController.delete);

module.exports = router;
