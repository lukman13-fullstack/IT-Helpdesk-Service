const {
  getAllUsersHandler,
  getUserByIdHandler,
  createUserHandler,
  updateUserHandler,
  deleteUserHandler,
  resetPasswordHandler,
  getProfileHandler,
  getUsersByDepartmentHandler,
} = require("../handlers");

const userController = {
  getAllUsers: getAllUsersHandler,
  getById: getUserByIdHandler,
  getByDepartment: getUsersByDepartmentHandler,
  create: createUserHandler,
  createUser: createUserHandler,
  update: updateUserHandler,
  delete: deleteUserHandler,
  deleteUser: deleteUserHandler,
  resetPassword: resetPasswordHandler,
  getOwnProfile: getProfileHandler,
};

module.exports = userController;
