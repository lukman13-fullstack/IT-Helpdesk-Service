const checkPermission = (requiredPermission) => {
  return (req, res, next) => {
    try {
      const user = req.user;

      if (!user || !user.role || !user.role.permissions) {
        return res.status(403).json({
          message: "Forbidden - User info incomplete",
        });
      }

      // Cek apakah user memiliki permission yang dibutuhkan
      const hasPermission = user.role.permissions.some(
        (rp) => rp.permission.name === requiredPermission
      );

      if (!hasPermission) {
        return res.status(403).json({
          message: "Anda tidak memiliki akses untuk melakukan operasi ini",
        });
      }

      next();
    } catch (error) {
      console.error("Error checking permission:", error);
      res
        .status(500)
        .json({ message: "Terjadi kesalahan saat mengecek permission" });
    }
  };
};

module.exports = checkPermission;
