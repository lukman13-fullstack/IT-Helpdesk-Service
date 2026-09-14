const prisma = require("../../utils/prisma");

async function getDrafts(req, res) {
  try {
    const drafts = await prisma.document_draft.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        createdBy: {
          select: { id: true, fullName: true, username: true }
        }
      }
    });
    res.json({ success: true, data: drafts });
  } catch (error) {
    console.error("Error getting drafts:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

async function createDraft(req, res) {
  try {
    const { title, data } = req.body;
    const createdById = req.user.id;

    const newDraft = await prisma.document_draft.create({
      data: {
        title: title || "Draft Tanpa Nama",
        data,
        createdById
      }
    });
    res.status(201).json({ success: true, data: newDraft });
  } catch (error) {
    console.error("Error creating draft:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

async function updateDraft(req, res) {
  try {
    const { id } = req.params;
    const { title, data } = req.body;

    const draft = await prisma.document_draft.findUnique({ where: { id } });
    if (!draft) {
      return res.status(404).json({ success: false, message: "Draft not found" });
    }

    const updatedDraft = await prisma.document_draft.update({
      where: { id },
      data: {
        title: title || draft.title,
        data: data !== undefined ? data : draft.data
      }
    });
    res.json({ success: true, data: updatedDraft });
  } catch (error) {
    console.error("Error updating draft:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

async function deleteDraft(req, res) {
  try {
    const { id } = req.params;
    const draft = await prisma.document_draft.findUnique({ where: { id } });
    if (!draft) {
      return res.status(404).json({ success: false, message: "Draft not found" });
    }

    await prisma.document_draft.delete({ where: { id } });
    res.json({ success: true, message: "Draft deleted successfully" });
  } catch (error) {
    console.error("Error deleting draft:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

module.exports = {
  getDrafts,
  createDraft,
  updateDraft,
  deleteDraft
};
