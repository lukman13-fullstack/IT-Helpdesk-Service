// Auth validators
const {
  loginValidator,
  changePasswordValidator,
  refreshTokenValidator,
} = require("./auth.validator");

// User validators
const {
  createUserValidator,
  updateUserValidator,
  resetPasswordValidator,
  getUserByIdValidator,
  deleteUserValidator,
} = require("./user.validator");

module.exports = {
  // Auth validators
  loginValidator,
  changePasswordValidator,
  refreshTokenValidator,

  // User validators
  createUserValidator,
  updateUserValidator,
  resetPasswordValidator,
  getUserByIdValidator,
  deleteUserValidator,
};
