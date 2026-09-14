const prisma = require("../../utils/prisma");
const { logDelete } = require("../../utils/logger");

/**
 * Delete Department Handler
 * 
 * Logic Flow:
 * 1. Validate department ID
 * 2. Check if department exists and not already deleted
 * 3. Check if there are ACTIVE users (not soft-deleted) in this department
 *    - If yes, return error with list of active users
 *    - If no (all users deleted or no users), proceed with deletion
 * 4. Use transaction to:
 *    a. Soft delete the department
 *    b. Clean up remaining user_department relations (from soft-deleted users)
 *    c. Soft delete all hierarchies in this department
 * 5. Log the deletion activity
 */
const deleteDepartmentHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const departmentId = parseInt(id);

    // Validate ID
    if (!id || isNaN(departmentId)) {
      return res.status(400).json({
        status: "error",
        message: "ID department tidak valid",
        data: null,
      });
    }

    // Get department with user relations
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      include: {
        users: {
          where: { isDeleted: false },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                username: true,
                isDeleted: true,
              },
            },
          },
        },
        hierarchies: {
          where: { isDeleted: false },
          select: { id: true },
        },
      },
    });

    // Check if department exists
    if (!department) {
      return res.status(404).json({
        status: "error",
        message: "Department tidak ditemukan",
        data: null,
      });
    }

    // Check if already deleted
    if (department.isDeleted) {
      return res.status(400).json({
        status: "error",
        message: "Department sudah dihapus sebelumnya",
        data: null,
      });
    }

    // Filter only ACTIVE users (not soft-deleted)
    const activeUsers = department.users.filter(
      (ud) => !ud.user.isDeleted
    );

    // Check if there are still active users
    if (activeUsers.length > 0) {
      const activeUserNames = activeUsers
        .map((ud) => ud.user.fullName)
        .join(", ");

      return res.status(400).json({
        status: "error",
        message: `Tidak bisa menghapus department yang masih memiliki user aktif. User aktif: ${activeUserNames}`,
        data: {
          activeUsersCount: activeUsers.length,
          activeUsers: activeUsers.map((ud) => ({
            id: ud.user.id,
            fullName: ud.user.fullName,
            username: ud.user.username,
          })),
        },
      });
    }

    // All checks passed - proceed with deletion using transaction
    await prisma.$transaction(async (tx) => {
      // 1. Soft delete department
      await tx.department.update({
        where: { id: departmentId },
        data: { isDeleted: true },
      });

      // 2. Soft delete remaining user_department relations
      await tx.user_department.updateMany({
        where: { departmentId: departmentId, isDeleted: false },
        data: { 
          isDeleted: true,
          deletedAt: new Date(),
        },
      });

      // 3. Soft delete all hierarchies in this department
      await tx.hierarchy.updateMany({
        where: { departmentId: departmentId, isDeleted: false },
        data: { isDeleted: true },
      });
    });

    // Log the deletion
    await logDelete(
      "departments",
      req.user.id,
      departmentId,
      {
        name: department.name,
        description: department.description,
        departmentCode: department.departmentCode,
      },
      `Department dihapus: ${department.name}`
    );

    res.json({
      status: "success",
      message: "Department berhasil dihapus",
      data: null,
    });
  } catch (error) {
    console.error("Delete department error:", error);
    res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan saat menghapus department",
      data: null,
    });
  }
};

module.exports = deleteDepartmentHandler;
