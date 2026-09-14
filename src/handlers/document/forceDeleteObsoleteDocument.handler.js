const prisma = require("../../utils/prisma");
const { createLog } = require("../../utils/logger");

async function forceDeleteObsoleteDocumentHandler(req, res) {
  try {
    const { id } = req.params;
    const documentId = parseInt(id);

    // Check if document exists and is obsolete
    const existingDocument = await prisma.document.findFirst({
      where: {
        id: documentId,
        isDeleted: true,
        status: "obsolete",
      },
    });

    if (!existingDocument) {
      return res.status(404).json({
        success: false,
        message: "Obsolete document not found",
      });
    }

    // Force delete all related records and the document in a transaction
    await prisma.$transaction(async (tx) => {
      // 1. Delete digital_approvals related to the document
      await tx.digital_approval.deleteMany({
        where: { documentId },
      });

      // 2. Delete document_histories
      await tx.document_history.deleteMany({
        where: { documentId },
      });

      // 3. Delete print_requests and their approvals
      const printRequests = await tx.print_request.findMany({
        where: { documentId },
        select: { id: true },
      });
      const printRequestIds = printRequests.map((pr) => pr.id);

      if (printRequestIds.length > 0) {
        await tx.digital_approval.deleteMany({
          where: { printRequestId: { in: printRequestIds } },
        });
        await tx.print_request.deleteMany({
          where: { documentId },
        });
      }

      // 4. Delete notifications
      await tx.notification.deleteMany({
        where: { documentId },
      });

      // 5. Delete document_reference_link (cascade should handle, but to be safe)
      await tx.document_reference_link.deleteMany({
        where: { documentId },
      });

      // 6. Delete work_instruction_templates (cascade should handle, but to be safe)
      await tx.work_instruction_template.deleteMany({
        where: { documentId },
      });

      // 7. Finally delete the document itself
      await tx.document.delete({
        where: { id: documentId },
      });
    });

    // Log the force deletion
    await createLog({
      action: "FORCE_DELETE",
      table: "document",
      userId: req.user.id,
      description: `User ${req.user.fullName} PERMANENTLY deleted obsolete document ${existingDocument.documentCode} - ${existingDocument.name}`,
      departmentId: existingDocument.departmentId,
    });

    return res.status(200).json({
      success: true,
      message: "Obsolete document permanently deleted",
    });
  } catch (error) {
    console.error("Error force deleting obsolete document:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to permanently delete obsolete document",
    });
  }
}

module.exports = forceDeleteObsoleteDocumentHandler;
