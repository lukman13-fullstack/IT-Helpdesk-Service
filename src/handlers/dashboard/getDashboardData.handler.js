const prisma = require("../../utils/prisma");

const getDashboardDataHandler = async (req, res) => {
  try {
    const { departmentId } = req.query;
    const user = req.user;
    
    // Determine the role name (normalize to lowercase for comparison)
    const roleName = user.role?.name?.toLowerCase() || "";
    const isSuperAdmin = roleName.includes("admin"); // Assumes 'super admin' or 'admin'
    const isQA = roleName.includes("qa");

    let whereClause = { isDeleted: false };

    // Dashboard shows aggregate data to ALL roles.
    // Only filter by department if explicitly selected (not 'all').
    if (departmentId && departmentId !== "all") {
      whereClause.departmentId = parseInt(departmentId);
    }

    // --- Query 1: Pie Chart (Internal vs External) ---
    // We need to count documents grouped by 'isInternal' or 'distribution'
    // The schema has 'isInternal' boolean and 'distribution' enum.
    // Let's use 'isInternal' boolean field as it's more direct for "Internal vs External".
    // Or check schema again. `isInternal` Boolean.
    
    // To get counts, we can use groupBy
    const documentsByInternal = await prisma.document.groupBy({
      by: ["isInternal"],
      where: whereClause,
      _count: {
        id: true,
      },
    });

    const pieChartData = [
      {
        name: "Internal Document",
        value: documentsByInternal.find((d) => d.isInternal === true)?._count.id || 0,
        fill: "#4ade80", // Greenish
      },
      {
        name: "External Document",
        value: documentsByInternal.find((d) => d.isInternal === false)?._count.id || 0,
        fill: "#f97316", // Orangish
      },
    ];

    // --- Query 2: Bar Chart (Internal Documents by Category) ---
    // Filter: whereClause AND isInternal = true (show ALL statuses in dashboard)
    const barChartClause = { ...whereClause, isInternal: true };
    
    const documentsByCategory = await prisma.document.groupBy({
      by: ["category"],
      where: barChartClause,
      _count: {
        id: true,
      },
    });

    // Map categories to readable names
    const categoryLabels = {
      form: "Form",
      standard: "Standard",
      instruksi_kerja: "Work Instruction",
      prosedur: "Procedure",
      manual_perusahaan: "Manual Company",
      manual_halal: "Manual Halal",
    };

    // Create a map from the query results for easy lookup
    const categoryCountMap = {};
    documentsByCategory.forEach((item) => {
      categoryCountMap[item.category] = item._count.id;
    });

    // Build bar chart data with ALL internal categories, showing 0 if no documents
    const barChartData = Object.entries(categoryLabels).map(([key, label]) => ({
      name: label,
      value: categoryCountMap[key] || 0,
      fill: "#8884d8", // Placeholder color, frontend can override
    }));

    // --- Query 3: General Stats / Status Counts ---
    // Initialize all counters with 0 to ensure frontend gets consistent keys
    const statusStats = {
      "Approved": 0,
      "Pending Approval": 0,
      "Rejected": 0,
    };

    // Calculate Approved count
    statusStats["Approved"] = await prisma.document.count({
      where: { ...whereClause, status: "approved" },
    });

    // Calculate Pending Approval count 
    // (Documents technically in 'draft' or other statuses but have active pending workflows)
    statusStats["Pending Approval"] = await prisma.document.count({
      where: {
        ...whereClause,
        approvals: {
          some: { 
            status: "pending",
            type: { in: ["approval", "revision"] }
          }
        }
      }
    });

    // Calculate pure Rejected/Draft count
    // (Documents with 'draft' or 'rejected' status that DO NOT have any pending workflows, meaning they really are idle failures)
    statusStats["Rejected"] = await prisma.document.count({
      where: {
        ...whereClause,
        status: { in: ["draft", "rejected"] },
        approvals: {
          none: { 
            status: "pending",
            type: { in: ["approval", "revision"] }
          }
        }
      }
    });


    // Return Data
    res.json({
      status: "success",
      data: {
        pieChart: pieChartData,
        barChart: barChartData,
        documentStatus: statusStats,
        canViewAll: true, // Always show filter for all roles
      },
    });

  } catch (error) {
    console.error("Get dashboard data error:", error);
    res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan saat mengambil data dashboard",
    });
  }
};

module.exports = getDashboardDataHandler;
