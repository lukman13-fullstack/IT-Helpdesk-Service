// Auth handlers
const loginHandler = require("./auth/login.handler");
const logoutHandler = require("./auth/logout.handler");
const refreshTokenHandler = require("./auth/refreshToken.handler");
const changePasswordHandler = require("./auth/changePassword.handler");
const getProfileHandler = require("./auth/getProfile.handler");

// User handlers
const getAllUsersHandler = require("./user/getAllUsers.handler");
const getUserByIdHandler = require("./user/getUserById.handler");
const createUserHandler = require("./user/createUser.handler");
const updateUserHandler = require("./user/updateUser.handler");
const deleteUserHandler = require("./user/deleteUser.handler");
const resetPasswordHandler = require("./user/resetPassword.handler");
const getUsersByDepartmentHandler = require("./user/getUsersByDepartment.handler");

// Department handlers
const getAllDepartmentsHandler = require("./department/getAllDepartments.handler");
const getDepartmentByIdHandler = require("./department/getDepartmentById.handler");
const createDepartmentHandler = require("./department/createDepartment.handler");
const updateDepartmentHandler = require("./department/updateDepartment.handler");
const deleteDepartmentHandler = require("./department/deleteDepartment.handler");

// Log handlers
const getAllLogsHandler = require("./log/getAllLogs.handler");

// Role handlers
const getAllRolesHandler = require("./role/getAllRoles.handler");
const getRoleByIdHandler = require("./role/getRoleById.handler");
const createRoleHandler = require("./role/createRole.handler");
const updateRoleHandler = require("./role/updateRole.handler");
const deleteRoleHandler = require("./role/deleteRole.handler");
const getAllPermissionsHandler = require("./role/getAllPermissions.handler");

module.exports = {
  // Auth handlers
  loginHandler,
  logoutHandler,
  refreshTokenHandler,
  changePasswordHandler,
  getProfileHandler,

  // User handlers
  getAllUsersHandler,
  getUserByIdHandler,
  createUserHandler,
  updateUserHandler,
  deleteUserHandler,
  resetPasswordHandler,
  getUsersByDepartmentHandler,

  // Department handlers
  getAllDepartmentsHandler,
  getDepartmentByIdHandler,
  createDepartmentHandler,
  updateDepartmentHandler,
  deleteDepartmentHandler,

  // Role handlers
  getAllRolesHandler,
  getRoleByIdHandler,
  createRoleHandler,
  updateRoleHandler,
  deleteRoleHandler,
  getAllPermissionsHandler,

  // Log handlers
  getAllLogsHandler,
};
