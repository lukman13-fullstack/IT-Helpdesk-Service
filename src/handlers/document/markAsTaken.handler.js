const prisma = require("../../utils/prisma");
const { isSuperAdmin } = require("../../utils/authorization.util");

async function markAsTakenHandler(req, res) {
  try {
    const { id, printRequestId } = req.params;
    const { picTaken, takenAt } = req.body;
    const userId = req.user.id;

    // Check if user is Super Admin
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Only Quality Assurance (Super Admin) can record document pickup.",
      });
    }

    if (!picTaken) {
      return res.status(400).json({
        success: false,
        message: "PIC name is required.",
      });
    }

    const printRequest = await prisma.print_request.findUnique({
      where: { id: parseInt(printRequestId) },
      include: { document: true },
    });

    if (!printRequest) {
      return res.status(404).json({
        success: false,
        message: "Print request not found",
      });
    }

    if (printRequest.documentId !== parseInt(id)) {
      return res.status(400).json({
        success: false,
        message: "Print request does not belong to this document",
      });
    }

    await prisma.print_request.update({
      where: { id: printRequest.id },
      data: {
        status: "completed",
        picTaken: picTaken,
        takenAt: takenAt ? new Date(takenAt) : new Date(),
      },
    });

    return res.json({
      success: true,
      message: "Document pickup recorded successfully.",
    });
  } catch (error) {
    console.error("Error recording pickup:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to record document pickup",
    });
  }
}

module.exports = markAsTakenHandler;
