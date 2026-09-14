const express = require('express');
const router = express.Router();
const { translateText } = require('../controllers/translate.controller');
const { verifyToken } = require('../middleware/auth');

// Protect the endpoint with JWT authentication
router.post('/text', verifyToken, translateText);

module.exports = router;
