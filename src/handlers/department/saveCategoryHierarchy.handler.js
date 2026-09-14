const prisma = require("../../utils/prisma");

/**
 * Create or update category hierarchy for a department
 * POST /departments/:id/category-hierarchies
 * Body: { category: string, hierarchies: [{ level: number, userId: number }] }
 */
async function saveCategoryHierarchyHandler(req, res) {
  try {
    const { id } = req.params;
    const { category, hierarchies } = req.body;

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

    // Validate category enum
    const validCategories = [
      "form",
      "standard",
      "instruksi_kerja",
      "prosedur",
      "manual_perusahaan",
      "manual_halal",
      "external",
    ];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: "Category tidak valid",
      });
    }

    if (!hierarchies || !Array.isArray(hierarchies)) {
      return res.status(400).json({
        success: false,
        message: "Hierarchies harus berupa array",
      });
    }

    const departmentId = parseInt(id);

    // Check if department exists
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
    });

    if (!department || department.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Department tidak ditemukan",
      });
    }

    // Validate no duplicate levels
    const levels = hierarchies.map((h) => h.level);
    const uniqueLevels = new Set(levels);
    if (levels.length !== uniqueLevels.size) {
      return res.status(400).json({
        success: false,
        message: "Level hierarchy tidak boleh duplikat",
      });
    }

    // Validate all users exist
    if (hierarchies.length > 0) {
      const userIds = hierarchies.map((h) => parseInt(h.userId));
      const usersCount = await prisma.user.count({
        where: { id: { in: userIds } },
      });

      if (usersCount !== userIds.length) {
        return res.status(400).json({
          success: false,
          message: "Satu atau lebih user tidak ditemukan",
        });
      }
    }

    // Get existing hierarchies for this category
    const existingHierarchies = await prisma.category_hierarchy.findMany({
      where: {
        departmentId,
        category,
        isDeleted: false,
      },
    });

    // Get soft-deleted hierarchies for potential reactivation
    const softDeletedHierarchies = await prisma.category_hierarchy.findMany({
      where: {
        departmentId,
        category,
        isDeleted: true,
      },
    });

    // Soft delete hierarchies not in the new list
    const newLevels = hierarchies.map((h) => parseInt(h.level));
    const hierarchiesToDelete = existingHierarchies.filter(
      (h) => !newLevels.includes(h.level)
    );

    if (hierarchiesToDelete.length > 0) {
      await prisma.category_hierarchy.updateMany({
        where: {
          id: { in: hierarchiesToDelete.map((h) => h.id) },
        },
        data: { isDeleted: true },
      });
    }

    // Update or create hierarchies
    for (const h of hierarchies) {
      const existing = existingHierarchies.find(
        (eh) => eh.level === parseInt(h.level)
      );

      const softDeleted = softDeletedHierarchies.find(
        (eh) => eh.level === parseInt(h.level)
      );

      if (existing) {
        // Update existing hierarchy
        await prisma.category_hierarchy.update({
          where: { id: existing.id },
          data: { userId: parseInt(h.userId) },
        });
      } else if (softDeleted) {
        // Reactivate soft-deleted hierarchy
        await prisma.category_hierarchy.update({
          where: { id: softDeleted.id },
          data: {
            userId: parseInt(h.userId),
            isDeleted: false,
          },
        });
      } else {
        // Create new hierarchy
        await prisma.category_hierarchy.create({
          data: {
            departmentId,
            category,
            level: parseInt(h.level),
            userId: parseInt(h.userId),
          },
        });
      }
    }

    // Fetch updated hierarchies
    const updatedHierarchies = await prisma.category_hierarchy.findMany({
      where: {
        departmentId,
        category,
        isDeleted: false,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: { level: "asc" },
    });

    res.json({
      success: true,
      message: "Category hierarchy berhasil disimpan",
      data: updatedHierarchies,
    });
  } catch (error) {
    console.error("Save category hierarchy error:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat menyimpan category hierarchy",
    });
  }
}

module.exports = saveCategoryHierarchyHandler;
