const magicLinkService = require("../../services/magicLink.service");
const { generateTokens } = require("../../utils/jwt");

/**
 * Magic Link Authentication Handler
 * Validates magic token, checks approval status, and returns JWT tokens for auto-login
 *
 * Response scenarios:
 * 1. Token valid + approval pending → Login success + redirect to target
 * 2. Token valid + approval already processed → Returns info message (not error)
 * 3. Token invalid/expired → Returns error
 *
 * @route GET /api/auth/magic/:token
 */
async function magicLinkHandler(req, res) {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        error: "Token is required",
      });
    }

    // Validate magic token
    let result;
    try {
      result = await magicLinkService.validateMagicToken(token);
    } catch (error) {
      const errorMessages = {
        INVALID_TOKEN: "Invalid magic link",
      };

      return res.status(401).json({
        error: errorMessages[error.message] || "Magic link validation failed",
        code: error.message,
      });
    }

    const { user, targetUrl } = result;

    // Generate JWT tokens for the user
    const { accessToken, refreshToken } = generateTokens(user);

    // Check if the related approval has already been processed
    const approvalStatus = await magicLinkService.checkApprovalStatus(
      targetUrl,
      user.id
    );

    // Return tokens, target URL, and approval status
    return res.status(200).json({
      success: true,
      message: approvalStatus.alreadyProcessed
        ? approvalStatus.message
        : "Authentication successful",
      accessToken,
      refreshToken,
      targetUrl,
      alreadyProcessed: approvalStatus.alreadyProcessed,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        departments: user.departments.map((ud) => ud.department),
      },
    });
  } catch (error) {
    console.error("Magic link authentication error:", error);
    return res.status(500).json({
      error: "Internal server error during authentication",
    });
  }
}

module.exports = magicLinkHandler;
