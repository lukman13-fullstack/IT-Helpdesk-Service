const prisma = require("../../utils/prisma");

/**
 * Mark a notification as read
 * PATCH /notifications/:id/read
 */
async function markNotificationAsReadHandler(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await prisma.notification.findUnique({
      where: { id: parseInt(id) },
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    if (notification.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to update this notification",
      });
    }

    const updatedNotification = await prisma.notification.update({
      where: { id: parseInt(id) },
      data: { isRead: true },
    });

    return res.json({
      success: true,
      message: "Notification marked as read",
      data: updatedNotification,
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to mark notification as read",
    });
  }
}

module.exports = markNotificationAsReadHandler;
