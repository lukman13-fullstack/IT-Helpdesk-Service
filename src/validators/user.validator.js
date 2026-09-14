const createUserValidator = (req, res, next) => {
  const { username, fullName, email, password, roleId } = req.body;
  const errors = [];

  if (!username) {
    errors.push("Username harus diisi");
  } else if (username.length < 3) {
    errors.push("Username minimal 3 karakter");
  } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    errors.push("Username hanya boleh mengandung huruf, angka, dan underscore");
  }

  if (!fullName) {
    errors.push("Nama lengkap harus diisi");
  } else if (fullName.length < 2) {
    errors.push("Nama lengkap minimal 2 karakter");
  }

  if (!email) {
    errors.push("Email harus diisi");
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("Format email tidak valid");
  }

  if (!password) {
    errors.push("Password harus diisi");
  } else if (password.length < 6) {
    errors.push("Password minimal 6 karakter");
  }

  if (!roleId) {
    errors.push("Role harus diisi");
  } else if (isNaN(parseInt(roleId))) {
    errors.push("Role ID harus berupa angka");
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

const updateUserValidator = (req, res, next) => {
  const { id } = req.params;
  const { username, fullName, email, password, roleId } = req.body;
  const errors = [];

  if (!id || isNaN(parseInt(id))) {
    errors.push("ID user tidak valid");
  }

  if (!username) {
    errors.push("Username harus diisi");
  } else if (username.length < 3) {
    errors.push("Username minimal 3 karakter");
  } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    errors.push("Username hanya boleh mengandung huruf, angka, dan underscore");
  }

  if (!fullName) {
    errors.push("Nama lengkap harus diisi");
  } else if (fullName.length < 2) {
    errors.push("Nama lengkap minimal 2 karakter");
  }

  if (!email) {
    errors.push("Email harus diisi");
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("Format email tidak valid");
  }

  if (!roleId) {
    errors.push("Role harus diisi");
  } else if (isNaN(parseInt(roleId))) {
    errors.push("Role ID harus berupa angka");
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

const resetPasswordValidator = (req, res, next) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  const errors = [];

  if (!id || isNaN(parseInt(id))) {
    errors.push("ID user tidak valid");
  }

  if (!newPassword) {
    errors.push("Password baru harus diisi");
  } else if (newPassword.length < 6) {
    errors.push("Password baru minimal 6 karakter");
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

const getUserByIdValidator = (req, res, next) => {
  const { id } = req.params;
  const errors = [];

  if (!id || isNaN(parseInt(id))) {
    errors.push("ID user tidak valid");
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

const deleteUserValidator = (req, res, next) => {
  const { id } = req.params;
  const errors = [];

  if (!id || isNaN(parseInt(id))) {
    errors.push("ID user tidak valid");
  }

  if (req.user.id === parseInt(id)) {
    errors.push("Tidak bisa menghapus user sendiri");
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
  createUserValidator,
  updateUserValidator,
  resetPasswordValidator,
  getUserByIdValidator,
  deleteUserValidator,
};
