const express = require("express");
const router = express.Router();
const userController = require("../controllers/user.controller");
const { verifyToken } = require("../middleware/auth");
const checkPermission = require("../middleware/checkPermission");
const {
  createUserValidator,
  updateUserValidator,
  resetPasswordValidator,
  getUserByIdValidator,
  deleteUserValidator,
} = require("../validators/user.validator");

router.use(verifyToken);

router.get("/", checkPermission("MANAGE_USERS"), userController.getAllUsers);
router.get("/me", userController.getOwnProfile);
router.get(
  "/department/:departmentId",
  checkPermission("MANAGE_USERS"),
  userController.getByDepartment
);
router.get(
  "/:id",
  checkPermission("MANAGE_USERS"),
  getUserByIdValidator,
  userController.getById
);
router.post(
  "/add",
  checkPermission("MANAGE_USERS"),
  createUserValidator,
  userController.create
);
router.put(
  "/:id",
  checkPermission("MANAGE_USERS"),
  updateUserValidator,
  userController.update
);
router.put(
  "/:id/reset-password",
  checkPermission("MANAGE_USERS"),
  resetPasswordValidator,
  userController.resetPassword
);
router.delete(
  "/:id",
  checkPermission("MANAGE_USERS"),
  deleteUserValidator,
  userController.delete
);

module.exports = router;
