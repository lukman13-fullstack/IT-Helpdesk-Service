const prisma = require("../../utils/prisma");

async function getWiTemplateHandler(req, res) {
  try {
    const { id } = req.params;

    const template = await prisma.work_instruction_template.findFirst({
      where: { documentId: parseInt(id), isActive: true },
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "No active Work Instruction template found for this document",
      });
    }

    const templateData =
      typeof template.templateData === "string"
        ? JSON.parse(template.templateData)
        : template.templateData;

    const styleData =
      typeof template.styleData === "string"
        ? JSON.parse(template.styleData)
        : template.styleData;

    res.json({
      success: true,
      data: {
        topSections: templateData?.topSections || [],
        instructionText: templateData?.instructionText || "",
        sections: templateData?.sections || [],
        attachments: templateData?.attachments || [],
        pages: templateData?.pages || null,
        style: styleData || null,
      },
    });
  } catch (error) {
    console.error("Get WI template error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get Work Instruction template",
    });
  }
}

module.exports = getWiTemplateHandler;
