const prisma = require("../../utils/prisma");
const { verifyRefreshToken, generateTokens } = require("../../utils/jwt");

const refreshTokenHandler = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        status: "error",
        message: "Refresh token diperlukan",
        data: null,
      });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (error) {
      if (error.name === "JsonWebTokenError") {
        return res.status(401).json({
          status: "error",
          message: "Token tidak valid",
          data: null,
        });
      }
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({
          status: "error",
          message: "Token sudah expired",
          data: null,
        });
      }
      return res.status(401).json({
        status: "error",
        message: "Refresh token tidak valid",
        data: null,
      });
    }

    // Cari user berdasarkan ID dari token
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
    });

    if (!user || user.tokenVersion !== decoded.tokenVersion) {
      return res.status(401).json({
        status: "error",
        message: "Refresh token tidak valid",
        data: null,
      });
    }

    // Generate access token baru
    const { accessToken } = generateTokens(user);

    res.json({
      status: "success",
      message: "Token berhasil diperbarui",
      data: {
        accessToken,
      },
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan saat memperbarui token",
      data: null,
    });
  }
};

module.exports = refreshTokenHandler;
