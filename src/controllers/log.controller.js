const { getAllLogsHandler } = require("../handlers");

const logController = {
  getAllLogs: getAllLogsHandler,
};

module.exports = logController;
