const prisma = require("../../utils/prisma");
const { logDelete } = require("../../utils/logger");

const deleteReferenceHandler = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if reference exists
    const existingReference = await prisma.document_reference.findUnique({
      where: { id: parseInt(id) },
      include: {
        _count: {
          select: {
            documents: true,
          },
        },
      },
    });

    if (!existingReference) {
      return res.status(404).json({
        status: "error",
        message: "Referensi dokumen tidak ditemukan",
        data: null,
      });
    }

    // Check if reference is linked to any documents
    if (existingReference._count.documents > 0) {
      return res.status(400).json({
        status: "error",
        message: `Referensi dokumen tidak dapat dihapus karena terhubung dengan ${existingReference._count.documents} dokumen. Pertimbangkan untuk menonaktifkan referensi ini.`,
        data: null,
      });
    }

    // Delete reference
    await prisma.document_reference.delete({
      where: { id: parseInt(id) },
    });

    // Log the deletion
    await logDelete(
      "document_reference",
      req.user.id,
      req.user.fullName,
      existingReference.id,
      existingReference,
      `Referensi dokumen dihapus: ${existingReference.name}`
    );

    res.json({
      status: "success",
      message: "Referensi dokumen berhasil dihapus",
      data: null,
    });
  } catch (error) {
    console.error("Delete reference error:", error);
    res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan saat menghapus referensi dokumen",
      data: null,
    });
  }
};

module.exports = deleteReferenceHandler;
