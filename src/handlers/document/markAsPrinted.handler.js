const prisma = require("../../utils/prisma");
const { isExpired } = require("../../utils/workingDays.util");
const { isSuperAdmin } = require("../../utils/authorization.util");

async function markAsPrintedHandler(req, res) {
  try {
    const { id, printRequestId } = req.params;
    const userId = req.user.id;

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

    // Verify document ID matches
    if (printRequest.documentId !== parseInt(id)) {
      return res.status(400).json({
        success: false,
        message: "Print request does not belong to this document",
      });
    }

    // CHECK: Only Super Admin can mark as printed
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Only Quality Assurance (Super Admin) can mark documents as printed.",
      });
    }

    // Check status - allow approved, ready, printed, or completed
    const allowedStatuses = ["approved", "ready", "printed", "completed"];
    if (!allowedStatuses.includes(printRequest.status)) {
      return res.status(400).json({
        success: false,
        message: "Print request is not approved",
      });
    }

    // Check expiry
    if (printRequest.expiresAt && isExpired(printRequest.expiresAt)) {
      // Mark as expired
      await prisma.print_request.update({
        where: { id: printRequest.id },
        data: { status: "expired" },
      });

      return res.status(400).json({
        success: false,
        message:
          "Print request has expired. Please request a new print approval.",
      });
    }

    const updateData = {
      printedAt: new Date(),
    };

    // If it was just approved, move to printed status
    if (printRequest.status === "approved") {
      updateData.status = "printed";
    }

    await prisma.print_request.update({
      where: { id: printRequest.id },
      data: updateData,
    });

    return res.json({
      success: true,
      message: "Document marked as printed",
    });
  } catch (error) {
    console.error("Error marking as printed:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to mark document as printed",
    });
  }
}

module.exports = markAsPrintedHandler;
