const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

exports.getAll = async (req, res) => {
  try {
    const categories = await prisma.ticket_category.findMany({
      where: { isActive: true, parentId: null },
      include: {
        children: {
          where: { isActive: true },
        },
        parent: true
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: "Error fetching categories", error: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const category = await prisma.ticket_category.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        children: {
          where: { isActive: true },
          include: {
            children: {
              where: { isActive: true },
              include: {
                children: {
                  where: { isActive: true }
                }
              }
            }
          }
        },
        parent: true
      },
    });
    if (!category || !category.isActive) return res.status(404).json({ message: "Category not found" });
    res.json(category);
  } catch (error) {
    res.status(500).json({ message: "Error fetching category", error: error.message });
  }
};

// Helper function to recursively create hierarchies
async function createHierarchies(parentId, hierarchies) {
  if (!hierarchies || !Array.isArray(hierarchies)) return;
  for (const item of hierarchies) {
    if (!item.name) continue;
    const child = await prisma.ticket_category.create({
      data: {
        name: item.name,
        description: item.description || "",
        parentId: parentId,
      }
    });
    if (item.children && item.children.length > 0) {
      await createHierarchies(child.id, item.children);
    }
  }
}

async function replaceHierarchies(parentId, hierarchies) {
  if (!hierarchies) return;

  // 1. Get all existing active children
  const existingChildren = await prisma.ticket_category.findMany({ 
    where: { parentId, isActive: true } 
  });
  
  const incomingIds = [];

  for (const item of hierarchies) {
    if (!item.name) continue;
    
    let child;
    if (item.id) {
      // Update existing
      child = await prisma.ticket_category.update({
        where: { id: item.id },
        data: {
          name: item.name,
          description: item.description || "",
          isActive: true
        }
      });
      incomingIds.push(child.id);
    } else {
      // Create new
      child = await prisma.ticket_category.create({
        data: {
          name: item.name,
          description: item.description || "",
          parentId: parentId,
          isActive: true
        }
      });
      incomingIds.push(child.id);
    }
    
    // Recursively process children
    if (item.children) {
      await replaceHierarchies(child.id, item.children);
    } else {
      await replaceHierarchies(child.id, []);
    }
  }

  // 2. Soft-delete any existing children that are not in the incoming list
  const childrenToDeactivate = existingChildren.filter(c => !incomingIds.includes(c.id));
  
  async function deactivateDescendants(id) {
    const children = await prisma.ticket_category.findMany({ where: { parentId: id, isActive: true } });
    for (const c of children) {
      await prisma.ticket_category.update({
        where: { id: c.id },
        data: { isActive: false }
      });
      await deactivateDescendants(c.id);
    }
  }

  for (const c of childrenToDeactivate) {
    await prisma.ticket_category.update({
      where: { id: c.id },
      data: { isActive: false }
    });
    await deactivateDescendants(c.id);
  }
}

exports.create = async (req, res) => {
  try {
    const { name, description, parentId, hierarchies } = req.body;
    const category = await prisma.ticket_category.create({
      data: { 
        name, 
        description, 
        parentId: parentId ? parseInt(parentId) : null 
      },
    });

    if (hierarchies && hierarchies.length > 0) {
      await createHierarchies(category.id, hierarchies);
    }

    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ message: "Error creating category", error: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { name, description, parentId, hierarchies } = req.body;
    const categoryId = parseInt(req.params.id);
    
    const category = await prisma.ticket_category.update({
      where: { id: categoryId },
      data: { 
        name, 
        description, 
        parentId: parentId ? parseInt(parentId) : null 
      },
    });

    if (hierarchies !== undefined) {
      await replaceHierarchies(categoryId, hierarchies);
    }

    res.json(category);
  } catch (error) {
    res.status(500).json({ message: "Error updating category", error: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    await prisma.ticket_category.update({
      where: { id: parseInt(req.params.id) },
      data: { isActive: false },
    });
    res.json({ message: "Category deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting category", error: error.message });
  }
};
