const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

/**
 * Add Master watermark to PDF (only on first page)
 * - Blue box with "PT. TOYO INK INDONESIA" on top
 * - Large "MASTER" text below
 * - Position: Bottom-right corner
 */
async function addMasterWatermark(pdfBuffer) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const firstPage = pages[0];
  const { width, height } = firstPage.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Box dimensions
  const boxWidth = 160;
  const boxHeight = 65;
  const boxX = width - boxWidth - 50; // 50px from right (shifted left)
  const boxY = 60; // 60px from bottom (moved up)

  // Draw blue border box with transparent color
  firstPage.drawRectangle({
    x: boxX,
    y: boxY,
    width: boxWidth,
    height: boxHeight,
    borderColor: rgb(0.6, 0.6, 1), // Light blue for transparency effect
    borderWidth: 2,
  });

  // Draw "PT. TOYO INK INDONESIA" text (smaller, on top)
  const companyText = "PT. TOYO INK INDONESIA";
  const companyFontSize = 8;
  const companyTextWidth = font.widthOfTextAtSize(companyText, companyFontSize);

  firstPage.drawText(companyText, {
    x: boxX + (boxWidth - companyTextWidth) / 2, // Center in box
    y: boxY + boxHeight - 15,
    size: companyFontSize,
    font: font,
    color: rgb(0, 0, 0.8), // Blue
    opacity: 0.3,
  });

  // Draw "MASTER" text (larger, below)
  const statusText = "MASTER";
  const statusFontSize = 26;
  const statusTextWidth = font.widthOfTextAtSize(statusText, statusFontSize);

  firstPage.drawText(statusText, {
    x: boxX + (boxWidth - statusTextWidth) / 2, // Center in box
    y: boxY + 20,
    size: statusFontSize,
    font: font,
    color: rgb(0, 0, 0.8), // Blue
    opacity: 0.3,
  });

  return await pdfDoc.save();
}

/**
 * Add Controlled watermark to all pages
 * - Blue box with "PT. TOYO INK INDONESIA" on top
 * - "CONTROLLED" text below
 * - Position: Bottom-right corner on all pages
 */
async function addControlledWatermark(pdfBuffer) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  pages.forEach((page) => {
    const { width, height } = page.getSize();

    // Box dimensions (standardized to match MASTER)
    const boxWidth = 160;
    const boxHeight = 65;
    const boxX = width - boxWidth - 50; // Shifted left
    const boxY = 60; // Moved up

    // Draw blue border box with transparent color
    page.drawRectangle({
      x: boxX,
      y: boxY,
      width: boxWidth,
      height: boxHeight,
      borderColor: rgb(0.6, 0.6, 1), // Light blue for transparency effect
      borderWidth: 2,
    });

    // Draw "PT. TOYO INK INDONESIA" text
    const companyText = "PT. TOYO INK INDONESIA";
    const companyFontSize = 8;
    const companyTextWidth = font.widthOfTextAtSize(
      companyText,
      companyFontSize
    );

    page.drawText(companyText, {
      x: boxX + (boxWidth - companyTextWidth) / 2,
      y: boxY + boxHeight - 15,
      size: companyFontSize,
      font: font,
      color: rgb(0, 0, 0.8), // Blue (standardized)
      opacity: 0.3,
    });

    // Draw "CONTROLLED" text
    const statusText = "CONTROLLED";
    const statusFontSize = 20; // Reduced from 26 to prevent overlap
    const statusTextWidth = font.widthOfTextAtSize(statusText, statusFontSize);

    page.drawText(statusText, {
      x: boxX + (boxWidth - statusTextWidth) / 2,
      y: boxY + 20,
      size: statusFontSize,
      font: font,
      color: rgb(0, 0, 0.8), // Blue (standardized)
      opacity: 0.3,
    });
  });

  return await pdfDoc.save();
}

/**
 * Add Uncontrolled watermark to all pages
 * - Red box with "PT. TOYO INK INDONESIA" on top
 * - "UNCONTROLLED" text below
 * - Position: Bottom-right corner on all pages
 */
async function addUncontrolledWatermark(pdfBuffer) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  pages.forEach((page) => {
    const { width, height } = page.getSize();

    // Box dimensions (standardized to match MASTER)
    const boxWidth = 160;
    const boxHeight = 65;
    const boxX = width - boxWidth - 50; // Shifted left
    const boxY = 60; // Moved up

    // Draw red border box for UNCONTROLLED with transparent color
    page.drawRectangle({
      x: boxX,
      y: boxY,
      width: boxWidth,
      height: boxHeight,
      borderColor: rgb(1, 0.85, 0.85), // Light red for transparency effect
      borderWidth: 2,
    });

    // Draw "PT. TOYO INK INDONESIA" text in red
    const companyText = "PT. TOYO INK INDONESIA";
    const companyFontSize = 8;
    const companyTextWidth = font.widthOfTextAtSize(
      companyText,
      companyFontSize
    );

    page.drawText(companyText, {
      x: boxX + (boxWidth - companyTextWidth) / 2,
      y: boxY + boxHeight - 15,
      size: companyFontSize,
      font: font,
      color: rgb(0.8, 0, 0), // Red color for UNCONTROLLED
      opacity: 0.3,
    });

    // Draw "UNCONTROLLED" text in red
    const statusText = "UNCONTROLLED";
    const statusFontSize = 18; // Reduced from 26 to prevent overlap
    const statusTextWidth = font.widthOfTextAtSize(statusText, statusFontSize);

    page.drawText(statusText, {
      x: boxX + (boxWidth - statusTextWidth) / 2,
      y: boxY + 20,
      size: statusFontSize,
      font: font,
      color: rgb(0.8, 0, 0), // Red color for UNCONTROLLED
      opacity: 0.3,
    });
  });

  return await pdfDoc.save();
}

/**
 * Add Obsolete watermark to all pages
 * - Red box with "PT. TOYO INK INDONESIA" on top
 * - "OBSOLETE" text below
 * - Position: Bottom-right corner on all pages
 */
async function addObsoleteWatermark(pdfBuffer) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  pages.forEach((page) => {
    const { width, height } = page.getSize();

    // Box dimensions (standardized to match MASTER)
    const boxWidth = 160;
    const boxHeight = 65;
    const boxX = width - boxWidth - 50; // Shifted left
    const boxY = 60; // Moved up

    // Draw red border box for OBSOLETE with transparent color
    page.drawRectangle({
      x: boxX,
      y: boxY,
      width: boxWidth,
      height: boxHeight,
      borderColor: rgb(1, 0.85, 0.85), // Light red for transparency effect
      borderWidth: 2,
    });

    // Draw "PT. TOYO INK INDONESIA" text in red
    const companyText = "PT. TOYO INK INDONESIA";
    const companyFontSize = 8;
    const companyTextWidth = font.widthOfTextAtSize(
      companyText,
      companyFontSize
    );

    page.drawText(companyText, {
      x: boxX + (boxWidth - companyTextWidth) / 2,
      y: boxY + boxHeight - 15,
      size: companyFontSize,
      font: font,
      color: rgb(0.8, 0, 0), // Red color for OBSOLETE
      opacity: 0.15, // More transparent
    });

    // Draw "OBSOLETE" text in red
    const statusText = "OBSOLETE";
    const statusFontSize = 26;
    const statusTextWidth = font.widthOfTextAtSize(statusText, statusFontSize);

    page.drawText(statusText, {
      x: boxX + (boxWidth - statusTextWidth) / 2,
      y: boxY + 20,
      size: statusFontSize,
      font: font,
      color: rgb(0.8, 0, 0), // Red color for OBSOLETE
      opacity: 0.15, // More transparent
    });
  });

  return await pdfDoc.save();
}

/**
 * Add "CONTROLLED COPY" watermark for Internal distribution (Blue)
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @returns {Promise<Uint8Array>} - Modified PDF buffer with blue watermark
 */
async function addControlledCopyWatermark(pdfBuffer) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  pages.forEach((page) => {
    const { width, height } = page.getSize();

    // Box dimensions (standardized)
    const boxWidth = 160;
    const boxHeight = 65;
    const boxX = (width - boxWidth) / 2; // Center horizontally
    const boxY = 60; // Bottom margin (standardized)

    // Draw rectangle with transparent blue border
    page.drawRectangle({
      x: boxX,
      y: boxY,
      width: boxWidth,
      height: boxHeight,
      borderColor: rgb(0.6, 0.6, 1), // Light blue for transparency effect
      borderWidth: 2,
    });

    // Draw "PT. TOYO INK INDONESIA" text (blue)
    const companyText = "PT. TOYO INK INDONESIA";
    const companyFontSize = 8;
    const companyTextWidth = font.widthOfTextAtSize(
      companyText,
      companyFontSize
    );

    page.drawText(companyText, {
      x: boxX + (boxWidth - companyTextWidth) / 2,
      y: boxY + boxHeight - 15,
      size: companyFontSize,
      font: font,
      color: rgb(0, 0, 0.8), // Blue (standardized)
      opacity: 0.3,
    });

    // Draw "CONTROLLED COPY" text (blue)
    const statusText = "CONTROLLED COPY";
    const statusFontSize = 20;
    const statusTextWidth = font.widthOfTextAtSize(statusText, statusFontSize);

    page.drawText(statusText, {
      x: boxX + (boxWidth - statusTextWidth) / 2,
      y: boxY + 20,
      size: statusFontSize,
      font: font,
      color: rgb(0, 0, 0.8), // Blue (standardized)
      opacity: 0.3,
    });
  });

  return await pdfDoc.save();
}

/**
 * Add "UNCONTROLLED COPY" watermark for External distribution (Red)
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @returns {Promise<Uint8Array>} - Modified PDF buffer with red watermark
 */
async function addUncontrolledCopyWatermark(pdfBuffer) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  pages.forEach((page) => {
    const { width, height } = page.getSize();

    // Box dimensions (standardized)
    const boxWidth = 160;
    const boxHeight = 65;
    const boxX = (width - boxWidth) / 2; // Center horizontally
    const boxY = 60; // Bottom margin (standardized)

    // Draw rectangle with red border for UNCONTROLLED COPY
    page.drawRectangle({
      x: boxX,
      y: boxY,
      width: boxWidth,
      height: boxHeight,
      borderColor: rgb(1, 0.85, 0.85), // Light red for transparency effect
      borderWidth: 2,
    });

    // Draw "PT. TOYO INK INDONESIA" text in red
    const companyText = "PT. TOYO INK INDONESIA";
    const companyFontSize = 8;
    const companyTextWidth = font.widthOfTextAtSize(
      companyText,
      companyFontSize
    );

    page.drawText(companyText, {
      x: boxX + (boxWidth - companyTextWidth) / 2,
      y: boxY + boxHeight - 15,
      size: companyFontSize,
      font: font,
      color: rgb(0.8, 0, 0), // Red color for UNCONTROLLED COPY
      opacity: 0.3,
    });

    // Draw "UNCONTROLLED COPY" text in red
    const statusText = "UNCONTROLLED COPY";
    const statusFontSize = 15; // Reduced from 18 to prevent overlap
    const statusTextWidth = font.widthOfTextAtSize(statusText, statusFontSize);

    page.drawText(statusText, {
      x: boxX + (boxWidth - statusTextWidth) / 2,
      y: boxY + 20,
      size: statusFontSize,
      font: font,
      color: rgb(0.8, 0, 0), // Red color for UNCONTROLLED COPY
      opacity: 0.3,
    });
  });

  return await pdfDoc.save();
}

module.exports = {
  addMasterWatermark,
  addControlledWatermark,
  addUncontrolledWatermark,
  addObsoleteWatermark,
  addControlledCopyWatermark,
  addUncontrolledCopyWatermark,
};
