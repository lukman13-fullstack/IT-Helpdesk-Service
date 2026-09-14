const prisma = require("../../utils/prisma");
const { logCreate } = require("../../utils/logger");

const createReferenceHandler = async (req, res) => {
  try {
    const { name, code, description, checkerId } = req.body;

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

    // Check if name already exists
    const existingName = await prisma.document_reference.findUnique({
      where: { name },
    });

    if (existingName) {
      return res.status(400).json({
        status: "error",
        message: "Nama referensi sudah digunakan",
        data: null,
      });
    }

    // Check if code already exists
    const existingCode = await prisma.document_reference.findUnique({
      where: { code },
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

    // Create reference
    const reference = await prisma.document_reference.create({
      data: {
        name,
        code: code.toUpperCase(),
        description,
        checkerId: checkerId ? parseInt(checkerId) : null,
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

    // Log the creation
    await logCreate(
      "document_reference",
      req.user.id,
      req.user.fullName,
      reference.id,
      {
        name,
        code: code.toUpperCase(),
        description,
        checkerId,
      },
      `Referensi dokumen baru dibuat: ${name}`
    );

    res.status(201).json({
      status: "success",
      message: "Referensi dokumen berhasil dibuat",
      data: reference,
    });
  } catch (error) {
    console.error("Create reference error:", error);
    res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan saat membuat referensi dokumen",
      data: null,
    });
  }
};

module.exports = createReferenceHandler;
