const prisma = require("./prisma");

/**
 * Category code mapping
 */
const CATEGORY_CODES = {
  form: "FRM",
  standard: "STD",
  instruksi_kerja: "IK",
  prosedur: "PM",
  manual_perusahaan: "MP",
  manual_halal: "MH",
  record: "RE",
};

/**
 * Category hierarchy level mapping
 */
const CATEGORY_LEVELS = {
  form: "III",
  standard: "III",
  instruksi_kerja: "III",
  prosedur: "II",
  manual_perusahaan: "I",
  manual_halal: "I",
  record: "III",
};

/**
 * Generate document code based on department and category
 * @param {number} departmentId - Department ID
 * @param {string} category - Document category (form, standard, instruksi_kerja, procedure_mutu, manual_procedure, manual_halal)
 * @returns {Promise<string>} - Generated document code (e.g., FRM / III / IT / 001)
 */
async function generateDocumentCode(
  departmentId,
  category,
  fillHoles = false,
  fillObsoleteHoles = true
) {
  try {
    // Get department
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { departmentCode: true },
    });

    if (!department || !department.departmentCode) {
      throw new Error(
        "Department code not found. Please set department code first."
      );
    }

    // Get category code
    const categoryCode = CATEGORY_CODES[category];
    if (!categoryCode) {
      throw new Error(`Invalid category: ${category}`);
    }

    // Get hierarchy level for this category
    const hierarchyLevel = CATEGORY_LEVELS[category];
    if (!hierarchyLevel) {
      throw new Error(`Invalid category for hierarchy level: ${category}`);
    }

    // Get next sequential number for this department and category
    // For Records, check record_document table; otherwise check document table
    let lastNumber = 0;
    let nextNumber = 0;

    if (category === "record") {
      const lastRecord = await prisma.record_document.findFirst({
        where: {
          departmentId,
          isDeleted: false,
        },
        orderBy: {
          id: "desc", // Using ID for records as they don't have a separate documentNumber field in schema
        },
        select: {
          documentCode: true,
        },
      });

      if (lastRecord && lastRecord.documentCode) {
        // Extract number from code: RE / III / DEPT / XX
        const parts = lastRecord.documentCode.split(" / ");
        const lastPart = parts[parts.length - 1];
        lastNumber = parseInt(lastPart) || 0;
      }
      nextNumber = lastNumber + 1;
    } else {
      if (fillHoles) {
        // If fillObsoleteHoles is true (Manual Registration), we treat obsolete docs as holes
        // by only querying active docs (isDeleted: false).
        // If fillObsoleteHoles is false (Migration), we treat obsolete docs as taken
        // by querying docs that haven't been manually force deleted (deletionReason: null).
        const whereClause = {
          departmentId,
          category,
        };
        
        if (fillObsoleteHoles) {
          whereClause.isDeleted = false;
        } else {
          whereClause.deletionReason = null;
        }

        const validDocs = await prisma.document.findMany({
          where: whereClause,
          select: {
            documentNumber: true,
          },
          orderBy: {
            documentNumber: "asc",
          },
        });

        let expected = 1;
        for (const doc of validDocs) {
          if (doc.documentNumber === expected) {
            expected++;
          } else if (doc.documentNumber > expected) {
            break; // Found a hole!
          }
        }
        nextNumber = expected;
      } else {
        // Do NOT fill holes. Find absolute MAX number of ACTIVE or MIGRATED OBSOLETE documents
        // Excludes manually deleted documents (which have a deletionReason)
        const lastDocument = await prisma.document.findFirst({
          where: {
            departmentId,
            category,
            deletionReason: null, // Ignore docs explicitly deleted by users
          },
          orderBy: {
            documentNumber: "desc",
          },
          select: {
            documentNumber: true,
          },
        });
        lastNumber = lastDocument ? lastDocument.documentNumber : 0;
        nextNumber = lastNumber + 1;
      }
    }

    // Format: {CATEGORY_CODE} / {LEVEL} / {DEPT_CODE} / {NUMBER}
    // Example: FRM / III / IT / 001
    const documentCode = `${categoryCode} / ${hierarchyLevel} / ${
      department.departmentCode
    } / ${String(nextNumber).padStart(2, "0")}`;

    return {
      documentCode,
      documentNumber: nextNumber,
    };
  } catch (error) {
    console.error("Error generating document code:", error);
    throw error;
  }
}

/**
 * Get category name from code
 * @param {string} category - Category code
 * @returns {string} - Category name
 */
function getCategoryName(category) {
  const categoryNames = {
    form: "Form Document",
    standard: "Standard Document",
    instruksi_kerja: "Instruksi Kerja Document",
    prosedur: "Prosedur Document",
    manual_perusahaan: "Manual Perusahaan Document",
    manual_halal: "Manual Halal Document",
  };
  return categoryNames[category] || category;
}

/**
 * Validate category
 * @param {string} category - Category to validate
 * @returns {boolean} - True if valid
 */
function isValidCategory(category) {
  return Object.keys(CATEGORY_CODES).includes(category);
}

/**
 * Get document level from category
 * @param {string} category - Document category
 * @returns {string} - Document level (I, II, III)
 */
function getDocumentLevel(category) {
  return CATEGORY_LEVELS[category] || "III";
}

module.exports = {
  generateDocumentCode,
  getCategoryName,
  isValidCategory,
  getDocumentLevel,
  CATEGORY_CODES,
  CATEGORY_LEVELS,
};
