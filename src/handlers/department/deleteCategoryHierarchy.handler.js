const prisma = require("../../utils/prisma");

/**
 * Delete category hierarchy for a department and category
 * DELETE /departments/:id/category-hierarchies/:category
 */
async function deleteCategoryHierarchyHandler(req, res) {
  try {
    const { id, category } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: "ID department tidak valid",
      });
    }

    if (!category) {
      return res.status(400).json({
        success: false,
        message: "Category wajib diisi",
      });
    }

    const departmentId = parseInt(id);

    // Soft delete all hierarchies for this category
    const result = await prisma.category_hierarchy.updateMany({
      where: {
        departmentId,
        category,
        isDeleted: false,
      },
      data: { isDeleted: true },
    });

    res.json({
      success: true,
      message: `${result.count} category hierarchy berhasil dihapus`,
    });
  } catch (error) {
    console.error("Delete category hierarchy error:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat menghapus category hierarchy",
    });
  }
}

module.exports = deleteCategoryHierarchyHandler;
