const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const dashboardController = {
  getDashboardData: async (req, res) => {
    try {
      const { departmentId } = req.query;
      
      const whereClause = {};
      if (departmentId && departmentId !== 'all') {
        whereClause.departmentId = parseInt(departmentId);
      }
      
      const tickets = await prisma.ticket.findMany({
        where: whereClause,
        include: { category: true }
      });
      
      const statusCounts = {
        OPEN: tickets.filter(t => t.status === 'OPEN').length,
        IN_PROGRESS: tickets.filter(t => t.status === 'IN_PROGRESS').length,
        WAITING_FOR_USER: tickets.filter(t => t.status === 'WAITING_FOR_USER').length,
        RESOLVED: tickets.filter(t => t.status === 'RESOLVED').length,
        CLOSED: tickets.filter(t => t.status === 'CLOSED').length,
      };

      // Group tickets by category for Pie Chart
      const categoryCounts = {};
      tickets.forEach(t => {
        const catName = t.category?.name || 'Uncategorized';
        categoryCounts[catName] = (categoryCounts[catName] || 0) + 1;
      });
      
      // Elegant, professional, less striking color palette
      const colors = ["#4f46e5", "#60a5fa", "#2dd4bf", "#c084fc", "#94a3b8"];
      const pieChart = Object.keys(categoryCounts).map((cat, index) => ({
        name: cat,
        value: categoryCounts[cat],
        fill: colors[index % colors.length]
      }));

      // Group by day of week for Bar Chart (Weekly volume)
      const dayCounts = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
      tickets.forEach(t => {
        // Simple day of week from createdAt
        const d = new Date(t.createdAt);
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayName = days[d.getDay()];
        if (dayCounts[dayName] !== undefined) {
          dayCounts[dayName]++;
        }
      });
      
      const barChart = Object.keys(dayCounts)
        .filter(d => d !== 'Sat' && d !== 'Sun') // Usually only show work days, or show all. Let's just show workdays for now, or maybe all days
        .map((day, index) => ({
        name: day,
        value: dayCounts[day],
        fill: colors[index % colors.length]
      }));

      res.json({
        documentStatus: statusCounts, // matched to frontend interface
        pieChart,
        barChart,
        canViewAll: true
      });
    } catch (error) {
      res.status(500).json({ message: "Error fetching dashboard", error: error.message });
    }
  },
  getQaPerformanceData: async (req, res) => {
    res.json([]);
  }
};

module.exports = dashboardController;
