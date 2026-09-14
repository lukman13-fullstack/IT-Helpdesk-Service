const prisma = require("../../utils/prisma");

/**
 * Get all category hierarchies for a department
 * GET /departments/:id/category-hierarchies
 */
async function getCategoryHierarchiesHandler(req, res) {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: "ID department tidak valid",
      });
    }

    const categoryHierarchies = await prisma.category_hierarchy.findMany({
      where: {
        departmentId: parseInt(id),
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
      orderBy: [{ category: "asc" }, { level: "asc" }],
    });

    // Group by category
    const groupedByCategory = categoryHierarchies.reduce((acc, item) => {
      const category = item.category;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push({
        id: item.id,
        level: item.level,
        userId: item.userId,
        user: item.user,
      });
      return acc;
    }, {});

    res.json({
      success: true,
      data: groupedByCategory,
    });
  } catch (error) {
    console.error("Get category hierarchies error:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat mengambil category hierarchies",
    });
  }
}

module.exports = getCategoryHierarchiesHandler;
