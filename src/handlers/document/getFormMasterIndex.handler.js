const prisma = require("../../utils/prisma");
const { hasPermission } = require("../../utils/authorization.util");

/**
 * Get Form Master Document Index - Returns all approved Form documents
 * with additional fields (documentFormat, retentionPeriod, storageLocation)
 * grouped by department
 */
async function getFormMasterIndexHandler(req, res) {
  try {
    const { departmentId, departmentIds, isInternal } = req.query;
    const isInternalBool = isInternal === "true" || isInternal === true;
    // Current year is only for display in template header
    const currentYear = new Date().getFullYear();

    // Check if user has permission to print or export
    const canPrint = hasPermission(req.user, "PRINT_LIST_DOCUMENT");
    const canExport = hasPermission(req.user, "EXPORT_EXCEL");

    // Build where clause - no year filter, show all approved Form documents
    const whereClause = {
      status: "approved",
      isDeleted: false,
      ...(isInternal !== undefined ? { isInternal: isInternalBool } : {}),
    };

    if (isInternal === "false" || isInternal === false) {
      whereClause.category = { in: ["form", "external"] };
    } else {
      whereClause.category = "form";
    }

    // Add department filter — support multiple IDs (comma-separated) for QA users
    if (departmentIds) {
      const ids = departmentIds.split(",").map((id) => parseInt(id)).filter(Boolean);
      if (ids.length > 0) {
        whereClause.departmentId = { in: ids };
      }
    } else if (departmentId) {
      whereClause.departmentId = parseInt(departmentId);
    }

    // Fetch departments
    const departmentWhere = { isDeleted: false };
    if (departmentIds) {
      const ids = departmentIds.split(",").map((id) => parseInt(id)).filter(Boolean);
      if (ids.length > 0) {
        departmentWhere.id = { in: ids };
      }
    } else if (departmentId) {
      departmentWhere.id = parseInt(departmentId);
    }

    const departments = await prisma.department.findMany({
      where: departmentWhere,
      orderBy: { name: "asc" },
    });

    // Fetch all approved Form documents (no year filter)
    const documents = await prisma.document.findMany({
      where: whereClause,
      include: {
        department: {
          select: {
            id: true,
            name: true,
            departmentCode: true,
          },
        },
      },
      orderBy: [{ departmentId: "asc" }, { documentNumber: "asc" }],
    });

    // Group documents by department
    const result = departments
      .map((department) => {
        const deptDocuments = documents.filter(
          (doc) => doc.departmentId === department.id
        );

        if (deptDocuments.length === 0) return null;

        return {
          department: {
            id: department.id,
            name: department.name,
            code: department.departmentCode,
          },
          documents: deptDocuments.map((doc, index) => {
            // Format document type label
            let documentTypeLabel = "-";
            if (doc.documentFormat === "digital_and_hard_document") {
              documentTypeLabel = "Digital & Hard Document";
            } else if (doc.documentFormat === "hard_document") {
              documentTypeLabel = "Hard Document";
            } else if (doc.documentFormat === "digital_document") {
              documentTypeLabel = "Digital Document";
            }

            // Combine retention periods into single column — display raw user input
            let retentionPeriod = "-";
            if (doc.documentFormat === "digital_and_hard_document") {
              const parts = [];
              if (doc.retentionPeriod)
                parts.push(`Digital: ${doc.retentionPeriod}`);
              if (doc.hardDocumentRetentionPeriod)
                parts.push(`Hard: ${doc.hardDocumentRetentionPeriod}`);
              retentionPeriod = parts.length > 0 ? parts.join(", ") : "-";
            } else {
              retentionPeriod = doc.retentionPeriod
                ? `${doc.retentionPeriod}`
                : "-";
            }

            // Combine storage locations into single column
            let storageLocation = "-";
            if (doc.documentFormat === "digital_and_hard_document") {
              const parts = [];
              if (doc.storageLocation)
                parts.push(`Digital: ${doc.storageLocation}`);
              if (doc.hardDocumentStorageLocation)
                parts.push(`Hard: ${doc.hardDocumentStorageLocation}`);
              storageLocation = parts.length > 0 ? parts.join(", ") : "-";
            } else {
              storageLocation = doc.storageLocation || "-";
            }

            return {
              no: index + 1,
              id: doc.id,
              name: doc.name,
              documentCode: doc.documentCode,
              documentNumber: doc.documentNumber,
              revision: doc.revision,
              dateOfIssue: doc.dateOfIssue, // Tanggal Terbit — original rev 00 release date
              releaseDate: doc.releaseDate, // Tanggal Revisi — current revision release date
              // Form-specific fields
              documentFormat: doc.documentFormat,
              documentTypeLabel,
              retentionPeriod,
              storageLocation,
              remark: doc.remark || "-",
            };
          }),
        };
      })
      .filter(Boolean); // Remove null entries

    return res.status(200).json({
      success: true,
      data: {
        year: currentYear,
        canPrint,
        canExport,
        departments: result,
      },
    });
  } catch (error) {
    console.error("Error getting form master index:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get form master index",
    });
  }
}

module.exports = getFormMasterIndexHandler;
