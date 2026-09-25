const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

exports.getAll = async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 50
    });
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: "Error fetching notifications", error: error.message });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    if (id !== 'all') {
      await prisma.notification.update({
        where: { id: parseInt(id), userId: req.user.id },
        data: { isRead: true }
      });
    } else {
      await prisma.notification.updateMany({
        where: { userId: req.user.id, isRead: false },
        data: { isRead: true }
      });
    }
    res.json({ message: "Notification(s) marked as read" });
  } catch (error) {
    res.status(500).json({ message: "Error marking notifications", error: error.message });
  }
};
