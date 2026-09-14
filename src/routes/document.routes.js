const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");
const checkPermission = require("../middleware/checkPermission");
const {
  uploadWithMaster,
  uploadMigration,
  uploadImage,
  handleUploadError,
} = require("../middleware/fileUpload.middleware");

const documentController = require("../controllers/documents.controller");

// Public route: serve WI step images (no auth needed for <img src> tags)
router.get("/wi/image/:imageId", documentController.getWiImage);

router.use(verifyToken);

router.post(
  "/",
  checkPermission("UPLOAD_DOCUMENT"),
  uploadWithMaster,
  handleUploadError,
  documentController.createDocument
);

router.post(
  "/preview-wi-template",
  documentController.previewWiTemplate
);

router.post(
  "/migrate",
  checkPermission("MIGRATE_DOCUMENT"),
  uploadMigration,
  handleUploadError,
  documentController.migrateDocuments
);

router.get("/", documentController.getAllDocuments);

router.get(
  "/obsolete",
  checkPermission("VIEW_OBSOLETE_DOCUMENTS"),
  documentController.getObsoleteDocuments
);

// Master Document Index - Get all documents grouped by department and category
router.get("/master-index", documentController.getMasterDocumentIndex);

// External Master Index - Get all external documents with publisher, form, dates
router.get("/external-master-index", documentController.getExternalMasterIndex);

// Form Master Index - Get all Form documents with additional fields
router.get("/form-master-index", documentController.getFormMasterIndex);

router.get("/shared", documentController.getSharedDocument);

// IMPORTANT: These static print-history routes MUST come before /:id routes
// Otherwise Express matches "print-history" as the :id parameter → 404
router.get("/print-history/all", documentController.getAllPrintHistory);
router.get("/print-history/:id", documentController.getPrintRequestById);

// IMPORTANT: Specific routes MUST come before /:id to avoid conflicts
router.get("/:id/preview", documentController.previewDocument);
router.get("/:id/print-preview", documentController.printPreviewDocument);
router.get("/history/:historyId/preview", documentController.previewDocumentHistory);
router.get("/:id/history", documentController.getDocumentHistory);
router.get("/:id/print-history", documentController.getPrintHistory);
router.get("/:id/wi-template", documentController.getWiTemplate);

router.get("/:id", documentController.getDocumentById);

router.put(
  "/:id",
  checkPermission("UPDATE_DOCUMENT"),
  uploadWithMaster,
  handleUploadError,
  documentController.updateDocument
);

router.delete(
  "/:id",
  checkPermission("DELETE_DOCUMENT"),
  documentController.deleteDocument
);



router.post(
  "/:id/revise",
  checkPermission("REVISE_DOCUMENT"),
  uploadWithMaster,
  handleUploadError,
  documentController.reviseDocument
);

router.patch(
  "/:id/publish",
  checkPermission("UPDATE_DOCUMENT"),
  documentController.togglePublishDocument
);

router.patch(
  "/:id/toggle-raw-download",
  documentController.toggleRawDownload
);

router.get(
  "/history/:historyId/download",
  checkPermission("DOWNLOAD_DOCUMENT"),
  documentController.downloadDocumentHistory
);

router.get(
  "/:id/download",
  checkPermission("DOWNLOAD_DOCUMENT"),
  documentController.downloadDocument
);

router.get(
  "/obsolete/:id",
  checkPermission("VIEW_OBSOLETE_DOCUMENTS"),
  documentController.getObsoleteDocumentById
);

// Force delete obsolete document - TEMPORARY feature to clean DB
router.delete(
  "/obsolete/:id/force",
  checkPermission("DELETE_DOCUMENT"),
  documentController.forceDeleteObsoleteDocument
);

// Preview obsolete document - VIEW permission only (for in-browser viewing)
router.get(
  "/obsolete/:id/preview",
  checkPermission("VIEW_OBSOLETE_DOCUMENTS"),
  documentController.previewObsoleteDocument
);

// Download obsolete document - DOWNLOAD permission required
router.get(
  "/obsolete/:id/download",
  checkPermission("DOWNLOAD_OBSOLETE_DOCUMENTS"),
  documentController.downloadObsoleteDocument
);

router.post(
  "/bulk-request-print",
  checkPermission("VIEW_DOCUMENTS"),
  documentController.bulkRequestPrint
);

router.post(
  "/:id/request-print",
  checkPermission("VIEW_DOCUMENTS"),
  documentController.requestPrint
);

router.post(
  "/:id/mark-ready/:printRequestId",
  checkPermission("VIEW_DOCUMENTS"),
  documentController.markAsReady
);

router.post(
  "/:id/mark-taken/:printRequestId",
  checkPermission("VIEW_DOCUMENTS"),
  documentController.markAsTaken
);

router.post(
  "/:id/mark-printed/:printRequestId",
  checkPermission("VIEW_DOCUMENTS"),
  documentController.markAsPrinted
);

// Work Instruction image upload
router.post(
  "/wi/upload-image",
  checkPermission("UPLOAD_DOCUMENT"),
  uploadImage,
  handleUploadError,
  documentController.uploadWiImage
);

module.exports = router;
