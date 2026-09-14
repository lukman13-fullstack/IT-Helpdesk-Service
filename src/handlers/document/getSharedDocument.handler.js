const prisma = require("../../utils/prisma");

async function getSharedDocument(req, res) {
  try {
    const { page = 1, limit = 10, departmentId, search, category } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);
    const where = { isPublished: true, isDeleted: false, status: "approved" };
    const departmentIdNumber = parseInt(departmentId);

    if (departmentId) {
      where.departmentId = departmentIdNumber;
    }

    if (search) {
      where.name = {
        contains: search,
      };
    }

    if (category) {
      where.category = category;
    }

    const total = await prisma.document.count({ where });

    const documents = await prisma.document.findMany({
      where,
      skip,
      take,
      orderBy: {
        createdAt: "desc",
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
    });

    const totalPages = Math.ceil(total / take);

    const data = documents.map((document) => ({
      ...document,
      departmentName: document.department ? document.department.name : null,
    }));

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        page: parseInt(page),
        limit: take,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error("Error getting shared document:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get shared document",
    });
  }
}

module.exports = getSharedDocument;
