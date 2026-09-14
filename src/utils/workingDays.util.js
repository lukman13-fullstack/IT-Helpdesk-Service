/**
 * Utility functions for working days calculation
 * Excludes weekends (Saturday and Sunday)
 */

/**
 * Add N working days to a given date
 * @param {Date} startDate - Starting date
 * @param {number} days - Number of working days to add
 * @returns {Date} - New date after adding working days
 */
function addWorkingDays(startDate, days) {
  const result = new Date(startDate);
  let daysAdded = 0;

  while (daysAdded < days) {
    result.setDate(result.getDate() + 1);
    // Skip weekends (0 = Sunday, 6 = Saturday)
    const dayOfWeek = result.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      daysAdded++;
    }
  }

  return result;
}

/**
 * Check if a date has expired (current date is past the expiry date)
 * @param {Date|string|null} expiresAt - The expiry date
 * @returns {boolean} - True if expired
 */
function isExpired(expiresAt) {
  if (!expiresAt) return false;
  const expiry = new Date(expiresAt);
  const now = new Date();
  return now > expiry;
}

/**
 * Calculate expiry date from approval date
 * 3 weeks = 15 working days
 * @param {Date} approvedAt - Approval date
 * @returns {Date} - Expiry date
 */
function calculateExpiryDate(approvedAt) {
  return addWorkingDays(approvedAt, 15); // 3 weeks working days
}

module.exports = {
  addWorkingDays,
  isExpired,
  calculateExpiryDate,
};
