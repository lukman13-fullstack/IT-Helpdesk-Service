const prisma = require("../../utils/prisma");
const { userBelongsToDepartment } = require("../../utils/authorization.util");

const toggleRawDownloadHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { isRawDownloadable } = req.body;

    const document = await prisma.document.findUnique({
      where: { id: parseInt(id) },
    });

    if (!document) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }

    // Check department access (only users of the exact same department)
    if (!userBelongsToDepartment(req.user, document.departmentId)) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to update raw download setting for this department's document",
      });
    }

    const updatedDocument = await prisma.document.update({
      where: { id: parseInt(id) },
      data: { isRawDownloadable },
    });

    return res.status(200).json({
      success: true,
      message: "Raw download setting updated successfully",
      data: updatedDocument
    });
  } catch (error) {
    console.error("Error toggling raw download:", error);
    return res.status(500).json({ success: false, message: "Failed to toggle raw download setting" });
  }
};

module.exports = toggleRawDownloadHandler;
