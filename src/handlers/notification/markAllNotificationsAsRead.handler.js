const prisma = require("../../utils/prisma");

async function markAllNotificationsAsReadHandler(req, res) {
  try {
    const userId = req.user.id;

    const result = await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: { isRead: true },
    });

    return res.json({
      success: true,
      message: `${result.count} notifications marked as read`,
      data: { count: result.count },
    });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to mark all notifications as read",
    });
  }
}

module.exports = markAllNotificationsAsReadHandler;
