const cron = require("node-cron");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const emailService = require("./email.service");

const appUrl = process.env.APP_URL || process.env.APP_FRONTEND_URL || "http://localhost:5173";

const initCronJobs = () => {
  // Run every day at 8:00 AM WIB (Asia/Jakarta)
  cron.schedule(
    "0 8 * * *",
    async () => {
      console.log("⏳ Running daily approval reminder check...");
    try {
      // Calculate date exactly 3 days ago (start of day and end of day)
      const today = new Date();

      const targetDateStart = new Date(today);
      targetDateStart.setDate(today.getDate() - 3);
      targetDateStart.setHours(0, 0, 0, 0);

      const targetDateEnd = new Date(today);
      targetDateEnd.setDate(today.getDate() - 3);
      targetDateEnd.setHours(23, 59, 59, 999);

      // Find pending digital approvals created exactly 3 days ago
      const pendingApprovals = await prisma.digital_approval.findMany({
        where: {
          status: "pending",
          createdAt: {
            gte: targetDateStart,
            lte: targetDateEnd,
          },
        },
        include: {
          approver: true,
          document: {
            include: {
              uploader: true,
            },
          },
        },
      });

      console.log(
        `Found ${pendingApprovals.length} pending approvals to remind (3 days old).`,
      );

      for (const approval of pendingApprovals) {
        if (!approval.approver.email) continue;

        await emailService.sendApprovalReminderEmail({
          userId: approval.approver.id,
          toEmail: approval.approver.email,
          toName: approval.approver.fullName,
          documentName: approval.document.name,
          documentCode: approval.document.documentCode,
          uploaderName: approval.document.uploader.fullName,
          level: approval.level,
          appUrl: appUrl,
          documentId: approval.documentId,
          daysPending: 3,
        });
      }

      console.log("✅ Daily reminder check completed.");
    } catch (error) {
      console.error("❌ Error running daily reminder check:", error);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Jakarta"
  });

  console.log(
    "🕒 Cron jobs initialized. Daily reminder scheduled at 08:00 AM.",
  );
};

module.exports = { initCronJobs };
