const createDepartmentValidator = (req, res, next) => {
  if (!req.body) {
    return res.status(400).json({
      status: "error",
      message:
        "Request body is required. Make sure Content-Type is application/json",
      data: null,
    });
  }

  const { name } = req.body;
  const errors = [];

  if (!name) {
    errors.push("Nama department harus diisi");
  } else if (name.length < 2) {
    errors.push("Nama department minimal 2 karakter");
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

const updateDepartmentValidator = (req, res, next) => {
  if (!req.body) {
    return res.status(400).json({
      status: "error",
      message:
        "Request body is required. Make sure Content-Type is application/json",
      data: null,
    });
  }

  const { id } = req.params;
  const { name } = req.body;
  const errors = [];

  if (!id || isNaN(parseInt(id))) {
    errors.push("ID department tidak valid");
  }

  if (!name) {
    errors.push("Nama department harus diisi");
  } else if (name.length < 2) {
    errors.push("Nama department minimal 2 karakter");
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
  createDepartmentValidator,
  updateDepartmentValidator,
};
