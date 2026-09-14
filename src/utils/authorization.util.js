/**
 * Check if user has permission to access documents from all departments
 */
function canViewAllDocuments(user) {
  // Check if user has VIEW_ALL_DOCUMENTS permission
  const hasViewAllPermission = user.role.permissions.some(
    (rp) => rp.permission.name === "VIEW_ALL_DOCUMENTS"
  );

  return hasViewAllPermission;
}

/**
 * Check if user belongs to a specific department
 */
function userBelongsToDepartment(user, departmentId) {
  return user.departments.some(
    (ud) => ud.departmentId === parseInt(departmentId)
  );
}

/**
 * Get user's department IDs
 */
function getUserDepartmentIds(user) {
  return user.departments.map((ud) => ud.departmentId);
}

/**
 * Check if user can bypass approval workflows
 */
function canBypassApproval(user) {
  // Check if user has BYPASS_ALL_APPROVAL permission
  const hasBypassPermission = user.role.permissions.some(
    (rp) => rp.permission.name === "BYPASS_ALL_APPROVAL"
  );

  return hasBypassPermission;
}

/**
 * Check if user has a specific permission
 */
function hasPermission(user, permissionName) {
  return user.role.permissions.some(
    (rp) => rp.permission.name === permissionName
  );
}

/**
 * Check if user is a Super Admin
 */
function isSuperAdmin(user) {
  if (!user || !user.role) return false;
  return user.role.name === "Super Admin" || user.role.name === "SUPER_ADMIN";
}

module.exports = {
  canViewAllDocuments,
  userBelongsToDepartment,
  getUserDepartmentIds,
  canBypassApproval,
  hasPermission,
  isSuperAdmin,
};
