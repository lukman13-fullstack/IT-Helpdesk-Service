const prisma = require("../../utils/prisma");
const {
  canViewAllDocuments,
  userBelongsToDepartment,
} = require("../../utils/authorization.util");

async function getDocumentHistoryHandler(req, res) {
  try {
    const { id } = req.params;

    const document = await prisma.document.findUnique({
      where: { id: parseInt(id) },
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    const hasViewAllAccess = canViewAllDocuments(req.user);
    if (!hasViewAllAccess) {
      const hasAccess = userBelongsToDepartment(
        req.user,
        document.departmentId
      );
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to view this document's history",
        });
      }
    }

    const history = await prisma.document_history.findMany({
      where: { documentId: parseInt(id) },
      orderBy: { createdAt: "desc" },
      include: {
        changer: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    // Extract current document raw basics for history combination
    const currentDocumentRaw = {
      id: null,
      documentId: document.id,
      name: document.name,
      description: document.description,
      version: document.version,
      revision: document.revision,
      googleDriveFileId: document.googleDriveFileId,
      filePath: document.filePath,
      fileSize: document.fileSize,
      mimeType: document.mimeType,
      masterDocumentGoogleDriveId: document.masterDocumentGoogleDriveId,
      masterDocumentPath: document.masterDocumentPath,
      masterDocumentFileSize: document.masterDocumentFileSize,
      masterDocumentMimeType: document.masterDocumentMimeType,
      changeDescription: null, // will be shifted later
      changedBy: document.uploadedBy,
      createdAt: document.updatedAt,
      releaseDate: document.releaseDate,
      changer: null,
      isCurrent: true,
    };

    // Combine current with history, then filter to ensure ONLY ONE entry per revision (the latest one)
    const rawCombined = [currentDocumentRaw, ...history];
    const uniqueHistory = [];
    const seenRevisions = new Set();

    for (const item of rawCombined) {
      if (!item) continue;
      const key = `${item.version}-${item.revision}`;
      if (!seenRevisions.has(key)) {
        seenRevisions.add(key);
        uniqueHistory.push(item);
      }
    }

    // Shift changeDescription backwards so each revision shows the reason it was created
    for (let i = 0; i < uniqueHistory.length - 1; i++) {
      uniqueHistory[i].changeDescription = uniqueHistory[i + 1].changeDescription;
    }
    if (uniqueHistory.length > 0) {
      uniqueHistory[uniqueHistory.length - 1].changeDescription = "-";
    }

    // Fetch revision purposes from digital_approval
    const approvals = await prisma.digital_approval.findMany({
      where: { 
        documentId: parseInt(id),
        type: "revision",
        level: 1 
      },
      select: {
        documentRevision: true,
        reason: true
      },
      distinct: ['documentRevision'] // Just get one per revision
    });

    const purposeMap = {};
    approvals.forEach(app => {
      purposeMap[app.documentRevision] = app.reason;
    });

    // Assign revisionPurpose to uniqueHistory array
    uniqueHistory.forEach(h => {
      h.revisionPurpose = purposeMap[h.revision] || "-";
    });

    return res.status(200).json({
      success: true,
      data: uniqueHistory,
    });
  } catch (error) {
    console.error("Error fetching document history:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch document history",
    });
  }
}

module.exports = getDocumentHistoryHandler;
