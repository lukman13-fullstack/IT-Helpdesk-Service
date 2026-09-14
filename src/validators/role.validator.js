const createRoleValidator = (req, res, next) => {
  if (!req.body) {
    return res.status(400).json({
      status: "error",
      message:
        "Request body is required. Make sure Content-Type is application/json",
      data: null,
    });
  }

  const { name, permissionIds } = req.body;
  const errors = [];

  if (!name) {
    errors.push("Nama role harus diisi");
  } else if (name.length < 2) {
    errors.push("Nama role minimal 2 karakter");
  }

  if (permissionIds) {
    if (!Array.isArray(permissionIds)) {
      errors.push("permissionIds harus berupa array");
    } else {
      permissionIds.forEach((id, index) => {
        if (!Number.isInteger(id) || id <= 0) {
          errors.push(
            `Permission ID pada index ${index} tidak valid (harus berupa integer positif)`
          );
        }
      });
    }
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

const updateRoleValidator = (req, res, next) => {
  if (!req.body) {
    return res.status(400).json({
      status: "error",
      message:
        "Request body is required. Make sure Content-Type is application/json",
      data: null,
    });
  }

  const { id } = req.params;
  const { name, permissionIds } = req.body;
  const errors = [];

  if (!id || isNaN(parseInt(id))) {
    errors.push("ID role tidak valid");
  }

  if (name !== undefined) {
    if (!name) {
      errors.push("Nama role harus diisi");
    } else if (name.length < 2) {
      errors.push("Nama role minimal 2 karakter");
    }
  }

  if (permissionIds) {
    if (!Array.isArray(permissionIds)) {
      errors.push("permissionIds harus berupa array");
    } else {
      permissionIds.forEach((id, index) => {
        if (!Number.isInteger(id) || id <= 0) {
          errors.push(
            `Permission ID pada index ${index} tidak valid (harus berupa integer positif)`
          );
        }
      });
    }
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
  createRoleValidator,
  updateRoleValidator,
};
