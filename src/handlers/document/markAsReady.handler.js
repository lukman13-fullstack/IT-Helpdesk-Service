const prisma = require("../../utils/prisma");
const { isSuperAdmin } = require("../../utils/authorization.util");
const { notifyPrintReady } = require("../../utils/notification.util");

async function markAsReadyHandler(req, res) {
  try {
    const { id, printRequestId } = req.params;
    const userId = req.user.id;

    // Check if user is Super Admin
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Only Quality Assurance (Super Admin) can mark documents as ready.",
      });
    }

    const printRequest = await prisma.print_request.findUnique({
      where: { id: parseInt(printRequestId) },
      include: { 
        document: true,
        requester: true
      },
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

    const allowedStatuses = ["approved", "printed"];
    if (!allowedStatuses.includes(printRequest.status)) {
      return res.status(400).json({
        success: false,
        message: `Print request must be approved or printed before marking as ready. Current status: ${printRequest.status}`,
      });
    }

    await prisma.print_request.update({
      where: { id: printRequest.id },
      data: {
        status: "ready",
        readyAt: new Date(),
      },
    });

    // Notify requester
    await notifyPrintReady(
      printRequest.documentId,
      printRequest.document.name,
      printRequest.requesterId,
      { documentCode: printRequest.document.documentCode }
    );

    return res.json({
      success: true,
      message: "Document marked as ready and requester notified.",
    });
  } catch (error) {
    console.error("Error marking as ready:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to mark document as ready",
    });
  }
}

module.exports = markAsReadyHandler;
