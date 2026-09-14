const prisma = require("../../utils/prisma");
const { logUpdate } = require("../../utils/logger");

const updateReferenceHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, description, checkerId, isActive } = req.body;

    // Check if reference exists
    const existingReference = await prisma.document_reference.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingReference) {
      return res.status(404).json({
        status: "error",
        message: "Referensi dokumen tidak ditemukan",
        data: null,
      });
    }

    // Validation
    if (!name) {
      return res.status(400).json({
        status: "error",
        message: "Nama referensi wajib diisi",
        data: null,
      });
    }

    if (!code) {
      return res.status(400).json({
        status: "error",
        message: "Kode referensi wajib diisi",
        data: null,
      });
    }

    // Check if name already exists (excluding current reference)
    const existingName = await prisma.document_reference.findFirst({
      where: {
        name,
        id: { not: parseInt(id) },
      },
    });

    if (existingName) {
      return res.status(400).json({
        status: "error",
        message: "Nama referensi sudah digunakan",
        data: null,
      });
    }

    // Check if code already exists (excluding current reference)
    const existingCode = await prisma.document_reference.findFirst({
      where: {
        code: code.toUpperCase(),
        id: { not: parseInt(id) },
      },
    });

    if (existingCode) {
      return res.status(400).json({
        status: "error",
        message: "Kode referensi sudah digunakan",
        data: null,
      });
    }

    // Validate checker if provided
    if (checkerId) {
      const checker = await prisma.user.findUnique({
        where: { id: parseInt(checkerId), isDeleted: false },
      });

      if (!checker) {
        return res.status(400).json({
          status: "error",
          message: "Checker tidak ditemukan",
          data: null,
        });
      }
    }

    // Update reference
    const reference = await prisma.document_reference.update({
      where: { id: parseInt(id) },
      data: {
        name,
        code: code.toUpperCase(),
        description,
        checkerId: checkerId ? parseInt(checkerId) : null,
        isActive: isActive !== undefined ? isActive : existingReference.isActive,
      },
      include: {
        checker: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    // Log the update
    await logUpdate(
      "document_reference",
      req.user.id,
      req.user.fullName,
      reference.id,
      existingReference,
      reference,
      `Referensi dokumen diperbarui: ${name}`
    );

    res.json({
      status: "success",
      message: "Referensi dokumen berhasil diperbarui",
      data: reference,
    });
  } catch (error) {
    console.error("Update reference error:", error);
    res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan saat memperbarui referensi dokumen",
      data: null,
    });
  }
};

module.exports = updateReferenceHandler;
