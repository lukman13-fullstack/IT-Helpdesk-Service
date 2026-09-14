const prisma = require("../../utils/prisma");

/**
 * Upload a Work Instruction step image.
 * Saves the image binary data directly to the wi_template_images table.
 * Returns a URL that can be used to serve the image from the backend.
 */
async function uploadWiImageHandler(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Image file is required",
      });
    }

    const file = req.file;

    // Save image binary to database
    const image = await prisma.wi_template_image.create({
      data: {
        data: file.buffer,
        mimeType: file.mimetype,
        fileName: file.originalname,
        fileSize: file.size,
      },
    });

    // Build URL that serves the image from backend
    const imageUrl = `/api/documents/wi/image/${image.id}`;

    return res.status(200).json({
      success: true,
      data: {
        id: image.id,
        imageUrl,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
      },
    });
  } catch (error) {
    console.error("Error uploading WI image:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to upload image",
    });
  }
}

module.exports = uploadWiImageHandler;
