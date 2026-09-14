const templateGeneratorService = require("../../services/templateGenerator.service");

async function previewWiTemplateHandler(req, res) {
  try {
    const { templateData, name } = req.body;

    if (!templateData) {
      return res.status(400).json({
        success: false,
        message: "Template data is required",
      });
    }

    let parsedTemplateData;
    try {
      parsedTemplateData = typeof templateData === 'string' ? JSON.parse(templateData) : templateData;
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: "Invalid template data format",
      });
    }

    const { pdfBuffer } = await templateGeneratorService.generateFiles(
      { documentCode: "PREVIEW", name: name || "Preview Document" },
      parsedTemplateData
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="preview.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);

    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Error generating WI template preview:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate WI template preview",
      error: error.message
    });
  }
}

module.exports = previewWiTemplateHandler;
