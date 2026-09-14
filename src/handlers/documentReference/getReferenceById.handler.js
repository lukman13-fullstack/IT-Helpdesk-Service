const prisma = require("../../utils/prisma");

const getReferenceByIdHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const reference = await prisma.document_reference.findUnique({
      where: { id: parseInt(id) },
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
        documents: {
          select: {
            id: true,
            document: {
              select: {
                id: true,
                name: true,
                documentCode: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!reference) {
      return res.status(404).json({
        status: "error",
        message: "Referensi dokumen tidak ditemukan",
        data: null,
      });
    }

    res.json({
      status: "success",
      message: "Detail referensi dokumen berhasil diambil",
      data: reference,
    });
  } catch (error) {
    console.error("Get reference by id error:", error);
    res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan saat mengambil detail referensi dokumen",
      data: null,
    });
  }
};

module.exports = getReferenceByIdHandler;
