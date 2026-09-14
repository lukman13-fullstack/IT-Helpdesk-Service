const {
  loginHandler,
  logoutHandler,
  refreshTokenHandler,
  changePasswordHandler,
  getProfileHandler,
} = require("../handlers");

const authController = {
  login: loginHandler,
  logout: logoutHandler,
  refreshToken: refreshTokenHandler,
  changePassword: changePasswordHandler,
  getProfile: getProfileHandler,
};

module.exports = authController;
