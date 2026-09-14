const prisma = require("../../utils/prisma");

const getAllReferencesHandler = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", all = false } = req.query;
    const skip = (page - 1) * limit;

    const whereClause = {
      ...(search && {
        OR: [
          { name: { contains: search } },
          { code: { contains: search } },
          { description: { contains: search } },
        ],
      }),
    };

    // If all=true, return all references without pagination (for dropdowns)
    if (all === "true" || all === true) {
      const references = await prisma.document_reference.findMany({
        where: {
          ...whereClause,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          code: true,
          description: true,
          checkerId: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          checker: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          _count: {
            select: {
              documents: true,
            },
          },
        },
        orderBy: { name: "asc" },
      });

      return res.json({
        status: "success",
        message: "Data referensi dokumen berhasil diambil",
        data: {
          references,
        },
      });
    }

    const [references, total] = await Promise.all([
      prisma.document_reference.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          code: true,
          description: true,
          checkerId: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          checker: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          _count: {
            select: {
              documents: true,
            },
          },
        },
        skip: parseInt(skip),
        take: parseInt(limit),
        orderBy: { name: "asc" },
      }),
      prisma.document_reference.count({ where: whereClause }),
    ]);

    res.json({
      status: "success",
      message: "Data referensi dokumen berhasil diambil",
      data: {
        references,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get all references error:", error);
    res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan saat mengambil data referensi dokumen",
      data: null,
    });
  }
};

module.exports = getAllReferencesHandler;
