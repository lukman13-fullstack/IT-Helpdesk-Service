const prisma = require("../../utils/prisma");

/**
 * Serve a Work Instruction step image from the database.
 * Returns the raw image binary with proper Content-Type header.
 */
async function getWiImageHandler(req, res) {
  try {
    const { imageId } = req.params;

    const image = await prisma.wi_template_image.findUnique({
      where: { id: parseInt(imageId) },
    });

    if (!image) {
      return res.status(404).json({
        success: false,
        message: "Image not found",
      });
    }

    // Set cache headers (images don't change once uploaded)
    res.set({
      "Content-Type": image.mimeType,
      "Content-Length": image.fileSize,
      "Cache-Control": "public, max-age=31536000", // 1 year cache
    });

    return res.send(image.data);
  } catch (error) {
    console.error("Error serving WI image:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load image",
    });
  }
}

module.exports = getWiImageHandler;
