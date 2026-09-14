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
const getCategoryHierarchiesHandler = require("./department/getCategoryHierarchies.handler");
const saveCategoryHierarchyHandler = require("./department/saveCategoryHierarchy.handler");
const deleteCategoryHierarchyHandler = require("./department/deleteCategoryHierarchy.handler");

// Document handlers
const createDocumentHandler = require("./document/createDocument.handler");
const getAllDocumentsHandler = require("./document/getAllDocuments.handler");
const getDocumentByIdHandler = require("./document/getDocumentById.handler");
const updateDocumentHandler = require("./document/updateDocument.handler");
const deleteDocumentHandler = require("./document/deleteDocument.handler");
const reviseDocumentHandler = require("./document/reviseDocument.handler");
const downloadDocumentHandler = require("./document/downloadDocument.handler");
const downloadDocumentHistoryHandler = require("./document/downloadDocumentHistory.handler");
const previewDocumentHandler = require("./document/previewDocument.handler");
const previewDocumentHistoryHandler = require("./document/previewDocumentHistory.handler");
const previewWiTemplateHandler = require("./document/previewWiTemplate.handler");
const printPreviewDocumentHandler = require("./document/printPreviewDocument.handler");
const togglePublishDocumentHandler = require("./document/togglePublishDocument.handler");
const toggleRawDownloadHandler = require("./document/toggleRawDownload.handler");
const getDocumentHistoryHandler = require("./document/getDocumentHistory.handler");
const getSharedDocumentHandler = require("./document/getSharedDocument.handler");
const getObsoleteDocumentsHandler = require("./document/getObsoleteDocuments.handler");
const getObsoleteDocumentByIdHandler = require("./document/getObsoleteDocumentById.handler");
const downloadObsoleteDocumentHandler = require("./document/downloadObsoleteDocument.handler");
const previewObsoleteDocumentHandler = require("./document/previewObsoleteDocument.handler");
const getMasterDocumentIndexHandler = require("./document/getMasterDocumentIndex.handler");
const getExternalMasterIndexHandler = require("./document/getExternalMasterIndex.handler");
const getFormMasterIndexHandler = require("./document/getFormMasterIndex.handler");
const requestPrintHandler = require("./document/requestPrint.handler");
const bulkRequestPrintHandler = require("./document/bulkRequestPrint.handler");
const getPrintHistoryHandler = require("./document/getPrintHistory.handler");
const getAllPrintHistoryHandler = require("./document/getAllPrintHistory.handler");
const getPrintRequestByIdHandler = require("./document/getPrintRequestById.handler");
const markAsPrintedHandler = require("./document/markAsPrinted.handler");
const markAsReadyHandler = require("./document/markAsReady.handler");
const markAsTakenHandler = require("./document/markAsTaken.handler");
const uploadWiImageHandler = require("./document/uploadWiImage.handler");
const getWiImageHandler = require("./document/getWiImage.handler");
const getWiTemplateHandler = require("./document/getWiTemplate.handler");
const migrateDocumentsHandler = require("./document/migrateDocuments.handler");
const forceDeleteObsoleteDocumentHandler = require("./document/forceDeleteObsoleteDocument.handler");

// Log handlers
const getAllLogsHandler = require("./log/getAllLogs.handler");

// Role handlers
const getAllRolesHandler = require("./role/getAllRoles.handler");
const getRoleByIdHandler = require("./role/getRoleById.handler");
const createRoleHandler = require("./role/createRole.handler");
const updateRoleHandler = require("./role/updateRole.handler");
const deleteRoleHandler = require("./role/deleteRole.handler");
const getAllPermissionsHandler = require("./role/getAllPermissions.handler");

// Document Reference handlers
const getAllReferencesHandler = require("./documentReference/getAllReferences.handler");
const getReferenceByIdHandler = require("./documentReference/getReferenceById.handler");
const createReferenceHandler = require("./documentReference/createReference.handler");
const updateReferenceHandler = require("./documentReference/updateReference.handler");
const deleteReferenceHandler = require("./documentReference/deleteReference.handler");

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
  getCategoryHierarchiesHandler,
  saveCategoryHierarchyHandler,
  deleteCategoryHierarchyHandler,

  // Document handlers
  createDocumentHandler,
  getAllDocumentsHandler,
  getDocumentByIdHandler,
  updateDocumentHandler,
  deleteDocumentHandler,
  reviseDocumentHandler,
  downloadDocumentHandler,
  downloadDocumentHistoryHandler,
  previewDocumentHandler,
  previewDocumentHistoryHandler,
  previewWiTemplateHandler,
  printPreviewDocumentHandler,
  togglePublishDocumentHandler,
  toggleRawDownloadHandler,
  getDocumentHistoryHandler,
  getSharedDocumentHandler,
  getObsoleteDocumentsHandler,
  getObsoleteDocumentByIdHandler,
  downloadObsoleteDocumentHandler,
  previewObsoleteDocumentHandler,
  getMasterDocumentIndexHandler,
  getExternalMasterIndexHandler,
  getFormMasterIndexHandler,
  requestPrintHandler,
  bulkRequestPrintHandler,
  getPrintHistoryHandler,
  getAllPrintHistoryHandler,
  getPrintRequestByIdHandler,
  markAsPrintedHandler,
  markAsReadyHandler,
  markAsTakenHandler,
  uploadWiImageHandler,
  getWiImageHandler,
  getWiTemplateHandler,
  migrateDocumentsHandler,
  forceDeleteObsoleteDocumentHandler,

  // Role handlers
  getAllRolesHandler,
  getRoleByIdHandler,
  createRoleHandler,
  updateRoleHandler,
  deleteRoleHandler,
  getAllPermissionsHandler,

  // Log handlers
  getAllLogsHandler,

  // Document Reference handlers
  getAllReferencesHandler,
  getReferenceByIdHandler,
  createReferenceHandler,
  updateReferenceHandler,
  deleteReferenceHandler,
};
