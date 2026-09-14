const {
  getAllRolesHandler,
  getRoleByIdHandler,
  createRoleHandler,
  updateRoleHandler,
  deleteRoleHandler,
  getAllPermissionsHandler,
} = require("../handlers");

const roleController = {
  getAll: getAllRolesHandler,
  getById: getRoleByIdHandler,
  create: createRoleHandler,
  update: updateRoleHandler,
  delete: deleteRoleHandler,
  getAllPermissions: getAllPermissionsHandler,
};

module.exports = roleController;
