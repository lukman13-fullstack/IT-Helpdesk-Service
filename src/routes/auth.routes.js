const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const magicLinkHandler = require("../handlers/auth/magicLink.handler");
const { verifyToken } = require("../middleware/auth");
const {
  loginValidator,
  changePasswordValidator,
  refreshTokenValidator,
} = require("../validators/auth.validator");

// Public routes (no auth required)
router.post("/login", loginValidator, authController.login);
router.post(
  "/refresh-token",
  refreshTokenValidator,
  authController.refreshToken
);

// Magic link auto-login (public)
router.get("/magic/:token", magicLinkHandler);

// Protected routes
router.post("/logout", verifyToken, authController.logout);
router.post(
  "/change-password",
  verifyToken,
  changePasswordValidator,
  authController.changePassword
);
router.get("/profile", verifyToken, authController.getProfile);

module.exports = router;
