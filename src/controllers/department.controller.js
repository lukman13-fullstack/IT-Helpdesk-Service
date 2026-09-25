const {
  getAllDepartmentsHandler,
  getDepartmentByIdHandler,
  createDepartmentHandler,
  updateDepartmentHandler,
  deleteDepartmentHandler,
} = require("../handlers");

const departmentController = {
  getAll: getAllDepartmentsHandler,
  getById: getDepartmentByIdHandler,
  create: createDepartmentHandler,
  update: updateDepartmentHandler,
  delete: deleteDepartmentHandler,
};

module.exports = departmentController;
