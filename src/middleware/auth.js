const jwt = require("jsonwebtoken");
const prisma = require("../utils/prisma");

const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res
        .status(401)
        .json({ message: "Unauthorized - Token tidak ditemukan" });
    }

    if (!authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ message: "Unauthorized - Format token tidak valid" });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res
        .status(401)
        .json({ message: "Unauthorized - Token tidak ditemukan" });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Fetch user with role and permissions to avoid N+1 queries later
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
          departments: true,
        },
      });

      if (!user) {
        return res
          .status(401)
          .json({ message: "Unauthorized - User tidak ditemukan" });
      }

      // Cek apakah token version masih sama
      if (user.tokenVersion !== decoded.tokenVersion) {
        return res
          .status(401)
          .json({ message: "Unauthorized - Token sudah tidak valid" });
      }

      // Tambahkan user ke request object
      req.user = user;

      next();
    } catch (jwtError) {
      if (jwtError.name === "JsonWebTokenError") {
        return res
          .status(401)
          .json({ message: "Unauthorized - Token tidak valid" });
      }
      if (jwtError.name === "TokenExpiredError") {
        return res
          .status(401)
          .json({ message: "Unauthorized - Token sudah expired" });
      }
      throw jwtError;
    }
  } catch (error) {
    console.error("Error verifying token:", error);
    res
      .status(500)
      .json({ message: "Terjadi kesalahan saat verifikasi token" });
  }
};

module.exports = {
  verifyToken,
};
