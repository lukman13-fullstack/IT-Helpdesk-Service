const express = require("express");
const router = express.Router();

const getDocumentVerificationHandler = require("../handlers/document/getDocumentVerification.handler");

/**
 * Public routes - No authentication required
 * These routes are accessible by anyone (e.g., QR code scanning)
 */

// GET /api/public/verify/:id - Get document verification data
router.get("/verify/:id", getDocumentVerificationHandler);

module.exports = router;
