const bcrypt = require("bcryptjs");
const prisma = require("../../utils/prisma");

const changePasswordHandler = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        status: "error",
        message: "Password lama dan password baru harus diisi",
        data: null,
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        status: "error",
        message: "Password baru minimal 6 karakter",
        data: null,
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User tidak ditemukan",
        data: null,
      });
    }

    const isValid = await bcrypt.compare(oldPassword, user.password);
    if (!isValid) {
      return res.status(400).json({
        status: "error",
        message: "Password lama salah",
        data: null,
      });
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        password: hashed,
        tokenVersion: { increment: 1 },
      },
    });

    res.json({
      status: "success",
      message: "Password berhasil diubah, silakan login kembali",
      data: null,
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({
      status: "error",
      message: "Gagal mengubah password",
      data: null,
    });
  }
};

module.exports = changePasswordHandler;
