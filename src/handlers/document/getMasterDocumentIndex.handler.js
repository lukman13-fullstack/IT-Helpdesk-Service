const prisma = require("../../utils/prisma");
const {
  getUserDepartmentIds,
  hasPermission,
} = require("../../utils/authorization.util");

/**
 * Get Master Document Index - Returns all approved/published documents
 * grouped by department and category for the user's own department(s) only
 */
async function getMasterDocumentIndexHandler(req, res) {
  try {
    const { departmentId, departmentIds, isInternal } = req.query;
    const isInternalBool = isInternal === "true" || isInternal === true;
    const isExternalBool = isInternal === "false" || isInternal === false;
    // Current year is only used for display in the template header
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

    // Fetch ALL approved documents for these departments (no year filter)
    const documents = await prisma.document.findMany({
      where: {
        departmentId: { in: departments.map((d) => d.id) },
        status: "approved",
        isDeleted: false,
        ...(isInternal !== undefined ? { isInternal: isInternalBool } : {}),
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
      orderBy: [{ category: "asc" }, { documentNumber: "asc" }],
    });

    // Group documents by department and category
    // New order: Manual, Procedure, Work Instruction, Standard, Form
    const categoryOrder = [
      "manual", // Combined: manual_perusahaan + manual_halal
      "prosedur",
      "instruksi_kerja",
      "standard",
      "form",
    ];

    const categoryLabels = {
      manual: "Manual",
      prosedur: "Prosedur / Procedure",
      instruksi_kerja: "Instruksi Kerja / Work Instruction",
      standard: "Standar / Standard",
      form: "Formulir / Form",
    };

    // Map categories - combine manual_perusahaan and manual_halal into "manual"
    const getCategoryGroup = (category) => {
      if (category === "manual_perusahaan" || category === "manual_halal") {
        return "manual";
      }
      return category;
    };

    // Build the grouped result
    const result = departments.map((department) => {
      const deptDocuments = documents.filter(
        (doc) => doc.departmentId === department.id
      );

      // Group by category
      const categories = categoryOrder
        .map((categoryGroup) => {
          const categoryDocs = deptDocuments.filter(
            (doc) => getCategoryGroup(doc.category) === categoryGroup
          );

          if (categoryDocs.length === 0) return null;

          return {
            category: categoryGroup,
            label: categoryLabels[categoryGroup] || categoryGroup,
            documents: categoryDocs.map((doc, index) => ({
              no: index + 1,
              id: doc.id,
              name: doc.name,
              documentCode: doc.documentCode,
              revision: doc.revision,
              dateOfIssue: doc.dateOfIssue, // Tanggal Terbit — original rev 00 release date
              releaseDate: doc.releaseDate, // Tanggal Revisi — current revision release date
              updatedAt: doc.updatedAt,
            })),
          };
        })
        .filter(Boolean);

      return {
        department: {
          id: department.id,
          name: department.name,
          departmentCode: department.departmentCode,
        },
        categories,
        documentType:
          isInternal === undefined
            ? "Dokumen Internal & Eksternal / Internal & External Document"
            : isInternalBool
            ? "Dokumen Internal / Internal Document"
            : "Dokumen Eksternal / External Document",
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
    console.error("Error getting master document index:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get master document index",
    });
  }
}

module.exports = getMasterDocumentIndexHandler;
