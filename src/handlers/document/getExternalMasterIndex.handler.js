const prisma = require("../../utils/prisma");
const {
  hasPermission,
} = require("../../utils/authorization.util");

/**
 * Get External Master Document Index - Returns all approved external documents
 * grouped by department with external-specific fields (publisher, document form, issue date, expired date)
 */
async function getExternalMasterIndexHandler(req, res) {
  try {
    const { departmentId, departmentIds } = req.query;
    const currentYear = new Date().getFullYear();

    // Check if user has permission to print or export
    const canPrint = hasPermission(req.user, "PRINT_LIST_DOCUMENT");
    const canExport = hasPermission(req.user, "EXPORT_EXCEL");

    // Build department filter — support multiple IDs (comma-separated) for QA users
    const departmentWhere = { isDeleted: false };
    if (departmentIds) {
      const ids = departmentIds.split(",").map((id) => parseInt(id)).filter(Boolean);
      if (ids.length > 0) {
        departmentWhere.id = { in: ids };
      }
    } else if (departmentId) {
      departmentWhere.id = parseInt(departmentId);
    }

    // Fetch all departments (or specific department if departmentId provided)
    const departments = await prisma.department.findMany({
      where: departmentWhere,
      orderBy: { name: "asc" },
    });

    // Fetch ALL approved external documents for these departments
    const documents = await prisma.document.findMany({
      where: {
        departmentId: { in: departments.map((d) => d.id) },
        status: "approved",
        isDeleted: false,
        isInternal: false, // Only external documents
      },
      include: {
        department: {
          select: {
            id: true,
            name: true,
            departmentCode: true,
          },
        },
      },
      orderBy: [{ name: "asc" }],
    });

    // Format document format for display
    const formatDocumentForm = (format) => {
      const formatMap = {
        digital_document: "Digital Document",
        hard_document: "Hard Document",
        digital_and_hard_document: "Digital & Hard Document",
      };
      return formatMap[format] || format || "-";
    };

    // Build the grouped result by department
    const result = departments.map((department) => {
      const deptDocuments = documents.filter(
        (doc) => doc.departmentId === department.id
      );

      return {
        department: {
          id: department.id,
          name: department.name,
          departmentCode: department.departmentCode,
        },
        documentType: "Dokumen Eksternal / External Document",
        documents: deptDocuments.map((doc, index) => ({
          no: index + 1,
          id: doc.id,
          name: doc.name,
          publishingInstitution: doc.publishingInstitution || "-",
          documentFormat: formatDocumentForm(doc.documentFormat),
          dateOfIssue: doc.dateOfIssue,
          expiredDate: doc.expiredDate,
        })),
      };
    });

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
    console.error("Error getting external master index:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get external master document index",
    });
  }
}

module.exports = getExternalMasterIndexHandler;
