const getDashboardDataHandler = require('../handlers/dashboard/getDashboardData.handler');
const getQaPerformanceDataHandler = require('../handlers/dashboard/getQaPerformanceData.handler');

const dashboardController = {
  getDashboardData: getDashboardDataHandler,
  getQaPerformanceData: getQaPerformanceDataHandler,
};

module.exports = dashboardController;
