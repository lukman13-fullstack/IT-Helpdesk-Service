const prisma = require('./src/utils/prisma');
const { calculateApprovalProgress } = require('./src/utils/approvalProgress.util');

async function test() {
  try {
    const document = await prisma.document.findFirst({
      where: {
        id: 1,
        isDeleted: false,
      },
      include: {
        department: {
          select: {
            id: true,
            name: true,
            departmentCode: true,
            description: true,
            hierarchies: {
              where: { isDeleted: false },
              select: {
                id: true,
                level: true,
                user: { select: { fullName: true } }
              }
            },
            categoryHierarchies: {
              where: { isDeleted: false },
              select: {
                id: true,
                level: true,
                category: true,
                user: { select: { fullName: true } }
              }
            }
          },
        },
        uploader: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        approvals: {
          orderBy: {
            level: "asc",
          },
          include: {
            approver: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
            approvedByUser: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
        history: {
          orderBy: {
            createdAt: "desc",
          },
          include: {
            changer: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
        references: {
          include: {
            checker: {
              select: {
                id: true,
                fullName: true,
              }
            },
            reference: {
              select: {
                id: true,
                name: true,
                code: true,
                description: true,
                checker: {
                  select: {
                    fullName: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
        workInstructionTemplates: {
          where: { isActive: true },
          orderBy: { revision: "desc" },
          take: 1,
        },
      },
    });

    console.log("Found document:", document ? document.id : null);
    
    // Test calculateProgress
    const progress = calculateApprovalProgress(document);
    console.log("Progress calculation successful:", progress);

  } catch (err) {
    console.error("Test failed with error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
