const {
  getAllDepartmentsHandler,
  getDepartmentByIdHandler,
  createDepartmentHandler,
  updateDepartmentHandler,
  deleteDepartmentHandler,
  getCategoryHierarchiesHandler,
  saveCategoryHierarchyHandler,
  deleteCategoryHierarchyHandler,
} = require("../handlers");

const departmentController = {
  getAll: getAllDepartmentsHandler,
  getById: getDepartmentByIdHandler,
  create: createDepartmentHandler,
  update: updateDepartmentHandler,
  delete: deleteDepartmentHandler,
  getCategoryHierarchies: getCategoryHierarchiesHandler,
  saveCategoryHierarchy: saveCategoryHierarchyHandler,
  deleteCategoryHierarchy: deleteCategoryHierarchyHandler,
};

module.exports = departmentController;
