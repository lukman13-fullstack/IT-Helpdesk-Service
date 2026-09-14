const prisma = require("../../utils/prisma");
const { logUpdate } = require("../../utils/logger");

const updateDepartmentHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, hierarchies, departmentCode } = req.body;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        status: "error",
        message: "ID department tidak valid",
        data: null,
      });
    }

    if (!name) {
      return res.status(400).json({
        status: "error",
        message: "Nama department wajib diisi",
        data: null,
      });
    }

    const existingDepartment = await prisma.department.findUnique({
      where: { id: parseInt(id) },
      include: { hierarchies: true },
    });

    if (!existingDepartment || existingDepartment.isDeleted) {
      return res.status(404).json({
        status: "error",
        message: "Department tidak ditemukan",
        data: null,
      });
    }

    const whereClause = {
      isDeleted: false,
      NOT: { id: parseInt(id) },
      OR: [{ name }],
    };

    if (departmentCode) {
      whereClause.OR.push({ departmentCode });
    }

    const duplicate = await prisma.department.findFirst({
      where: whereClause,
    });

    if (duplicate) {
      let message = "Nama department sudah digunakan";
      if (departmentCode && duplicate.departmentCode === departmentCode) {
        message = "Department code sudah digunakan";
      }
      return res.status(400).json({
        status: "error",
        message: message,
        data: null,
      });
    }

    if (hierarchies && Array.isArray(hierarchies) && hierarchies.length > 0) {
      const levels = hierarchies.map((h) => h.level);
      const uniqueLevels = new Set(levels);
      if (levels.length !== uniqueLevels.size) {
        return res.status(400).json({
          status: "error",
          message: "Level hierarchy tidak boleh duplikat dalam satu department",
          data: null,
        });
      }

      const userIds = hierarchies.map((h) => parseInt(h.userId));
      const usersCount = await prisma.user.count({
        where: { id: { in: userIds } },
      });

      if (usersCount !== userIds.length) {
        return res.status(400).json({
          status: "error",
          message: "Satu atau lebih user tidak ditemukan",
          data: null,
        });
      }
    }

    const codeToCheck =
      departmentCode !== undefined
        ? departmentCode
        : existingDepartment.departmentCode;

    let hasHierarchies = false;
    if (hierarchies !== undefined) {
      hasHierarchies = hierarchies.length > 0;
    } else {
      hasHierarchies = existingDepartment.hierarchies.length > 0;
    }

    const status = "active";

    // Update hierarchies if provided
    if (hierarchies !== undefined) {
      // Get existing active hierarchies
      const existingHierarchies = await prisma.hierarchy.findMany({
        where: {
          departmentId: parseInt(id),
          isDeleted: false,
        },
      });

      // Get soft-deleted hierarchies
      const softDeletedHierarchies = await prisma.hierarchy.findMany({
        where: {
          departmentId: parseInt(id),
          isDeleted: true,
        },
      });

      // Soft delete hierarchies that are not in the new list
      const newLevels = hierarchies.map((h) => parseInt(h.level));
      const hierarchiesToDelete = existingHierarchies.filter(
        (h) => !newLevels.includes(h.level)
      );

      if (hierarchiesToDelete.length > 0) {
        await prisma.hierarchy.updateMany({
          where: {
            id: { in: hierarchiesToDelete.map((h) => h.id) },
          },
          data: { isDeleted: true },
        });
      }

      // Update or create hierarchies
      for (const h of hierarchies) {
        const existing = existingHierarchies.find(
          (eh) => eh.level === parseInt(h.level)
        );

        const softDeleted = softDeletedHierarchies.find(
          (eh) => eh.level === parseInt(h.level)
        );

        if (existing) {
          // Update existing hierarchy
          await prisma.hierarchy.update({
            where: { id: existing.id },
            data: { userId: parseInt(h.userId) },
          });
        } else if (softDeleted) {
          // Reactivate soft-deleted hierarchy
          await prisma.hierarchy.update({
            where: { id: softDeleted.id },
            data: {
              userId: parseInt(h.userId),
              isDeleted: false,
            },
          });
        } else {
          // Create new hierarchy
          await prisma.hierarchy.create({
            data: {
              departmentId: parseInt(id),
              userId: parseInt(h.userId),
              level: parseInt(h.level),
            },
          });
        }
      }
    }

    const department = await prisma.department.update({
      where: { id: parseInt(id) },
      data: {
        name,
        description,
        departmentCode,
        status,
      },
      include: {
        hierarchies: {
          where: { isDeleted: false },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                fullName: true,
              },
            },
          },
          orderBy: { level: "asc" },
        },
      },
    });

    await logUpdate(
      "departments",
      req.user.id,
      parseInt(id),
      {
        name: existingDepartment.name,
        description: existingDepartment.description,
        departmentCode: existingDepartment.departmentCode,
        hierarchies: existingDepartment.hierarchies,
        status: existingDepartment.status,
      },
      {
        name,
        description,
        hierarchies,
        departmentCode,
        status,
      },
      `Department diupdate: ${name} (${status})`
    );

    res.json({
      status: "success",
      message: "Department berhasil diupdate",
      data: department,
    });
  } catch (error) {
    console.error("Update department error:", error);
    res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan saat mengupdate department",
      data: null,
    });
  }
};

module.exports = updateDepartmentHandler;
