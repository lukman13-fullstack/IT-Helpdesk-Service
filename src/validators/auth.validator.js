const loginValidator = (req, res, next) => {
  const { username, password } = req.body;
  const errors = [];

  if (!username) {
    errors.push("Username harus diisi");
  }

  if (!password) {
    errors.push("Password harus diisi");
  }

  if (username && username.length < 3) {
    errors.push("Username minimal 3 karakter");
  }

  if (password && password.length < 6) {
    errors.push("Password minimal 6 karakter");
  }

  if (errors.length > 0) {
    return res.status(400).json({
      status: "error",
      message: "Validasi gagal",
      data: { errors },
    });
  }

  next();
};

const changePasswordValidator = (req, res, next) => {
  const { oldPassword, newPassword } = req.body;
  const errors = [];

  if (!oldPassword) {
    errors.push("Password lama harus diisi");
  }

  if (!newPassword) {
    errors.push("Password baru harus diisi");
  }

  if (newPassword && newPassword.length < 6) {
    errors.push("Password baru minimal 6 karakter");
  }

  if (oldPassword && newPassword && oldPassword === newPassword) {
    errors.push("Password baru harus berbeda dengan password lama");
  }

  if (errors.length > 0) {
    return res.status(400).json({
      status: "error",
      message: "Validasi gagal",
      data: { errors },
    });
  }

  next();
};

const refreshTokenValidator = (req, res, next) => {
  const { refreshToken } = req.body;
  const errors = [];

  if (!refreshToken) {
    errors.push("Refresh token harus diisi");
  }

  if (errors.length > 0) {
    return res.status(400).json({
      status: "error",
      message: "Validasi gagal",
      data: { errors },
    });
  }

  next();
};

module.exports = {
  loginValidator,
  changePasswordValidator,
  refreshTokenValidator,
};
