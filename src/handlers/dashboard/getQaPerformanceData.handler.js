const prisma = require("../../utils/prisma");

const getQaPerformanceDataHandler = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { departments: { include: { department: true } } }
    });
    
    const roleName = req.user.role?.name?.toLowerCase() || "";
    // Check if user belongs to QA department instead of just role name
    const isQA = currentUser?.departments?.some(d => d.department?.departmentCode === "QA" || d.department?.name?.toLowerCase().includes("qa"));

    if (!isQA) {
      return res.status(403).json({
        status: "error",
        message: "Akses ditolak. Anda tidak memiliki izin untuk melihat data ini.",
      });
    }

    let dateFilter = {};
    if (startDate && endDate) {
      // Set endDate to end of the day
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      dateFilter = {
        createdAt: {
          gte: new Date(startDate),
          lte: endOfDay
        }
      };
    }

    // Fetch all documents within the date range
    const docs = await prisma.document.findMany({
      where: {
        isDeleted: false,
        ...dateFilter
      },
      select: {
        id: true,
        createdAt: true,
        revision: true,
        approvals: {
          select: {
            level: true,
            status: true,
            approvedAt: true,
            documentRevision: true,
            type: true
          }
        }
      }
    });

    const totalDocumentReq = docs.length;
    let qaApproveCount = 0;
    let dynamicLevelApprovals = {};

    let within3DaysCount = 0;
    let over3DaysCount = 0;
    let pendingQaCount = 0;
    let totalPendingCount = 0;

    const MS_PER_DAY = 1000 * 60 * 60 * 24;

    docs.forEach(doc => {
      // Check for any pending approval for the current revision
      const hasPendingApproval = doc.approvals.some(a => 
        a.documentRevision === doc.revision && 
        a.status === "pending" && 
        (a.type === "approval" || a.type === "revision")
      );
      if (hasPendingApproval) {
        totalPendingCount++;
      }

      // Find QA approval (Level 1) for the current revision, explicitly excluding print/deletion
      const qaApproval = doc.approvals.find(a => 
        a.level === 1 && 
        a.documentRevision === doc.revision && 
        (a.type === "approval" || a.type === "revision")
      );
      const isQaApproved = qaApproval && qaApproval.status === "approved";

      if (isQaApproved) {
        qaApproveCount++;

        // Calculate time taken
        const createdDate = new Date(doc.createdAt);
        const approvedDate = qaApproval.approvedAt ? new Date(qaApproval.approvedAt) : new Date(); // Fallback
        
        let diffMs = approvedDate.getTime() - createdDate.getTime();
        let weekendDays = 0;
        
        let current = new Date(createdDate.getTime());
        current.setHours(0,0,0,0);
        const end = new Date(approvedDate.getTime());
        end.setHours(0,0,0,0);
        
        current.setDate(current.getDate() + 1);
        while (current <= end) {
          const day = current.getDay();
          if (day === 0 || day === 6) { // 0 = Sunday, 6 = Saturday
            weekendDays++;
          }
          current.setDate(current.getDate() + 1);
        }
        
        const weekendMs = weekendDays * MS_PER_DAY;
        const diffDays = Math.max(0, (diffMs - weekendMs) / MS_PER_DAY);

        if (diffDays <= 3) {
          within3DaysCount++;
        } else {
          over3DaysCount++;
        }
      } else if (qaApproval && qaApproval.status === "pending") {
        pendingQaCount++;
      }

      // Check for business level approvals dynamically (Level > 1)
      doc.approvals.forEach(a => {
        if (a.level > 1 && a.status === "approved" && a.documentRevision === doc.revision) {
          dynamicLevelApprovals[a.level] = (dynamicLevelApprovals[a.level] || 0) + 1;
        }
      });
    });

    // Format dynamic levels to array
    const dynamicLevelsArray = Object.keys(dynamicLevelApprovals)
      .map(level => ({
        level: parseInt(level),
        count: dynamicLevelApprovals[level]
      }))
      .sort((a, b) => a.level - b.level);

    res.json({
      status: "success",
      data: {
        totalDocReq: totalDocumentReq,
        qaApprove: qaApproveCount,
        dynamicLevels: dynamicLevelsArray,
        within3Days: within3DaysCount,
        over3Days: over3DaysCount,
        pendingQa: pendingQaCount,
        totalPending: totalPendingCount,
      }
    });

  } catch (error) {
    console.error("Get QA performance data error:", error);
    res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan saat mengambil data performa QA",
    });
  }
};

module.exports = getQaPerformanceDataHandler;
