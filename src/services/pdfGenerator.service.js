const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");

class PDFGeneratorService {
  /**
   * Generate cover page with approval signatures and QR code
   * @param {Object} documentData - Document data
   * @param {Array} approvals - Array of approval data
   * @returns {Promise<Buffer>} - PDF buffer with cover page
   */
  async generateCoverPage(documentData, approvals) {
    try {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([595, 842]); // A4 size in points
      const { width, height } = page.getSize();

      // Load fonts
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

      let yPosition = height - 40;

      // Draw Main Border
      page.drawRectangle({
        x: 40,
        y: 40,
        width: width - 80,
        height: height - 80,
        borderColor: rgb(0, 0, 0),
        borderWidth: 1,
      });

      // Header Section - Table with 3 columns
      const headerHeight = 60;
      const headerY = height - 40 - headerHeight;

      // Define column widths
      const col1Width = 180; // Left column for logo
      const col3Width = 180; // Right column for company name
      const col2Width = width - 80 - col1Width - col3Width; // Center column (remaining space)

      const col1X = 40;
      const col2X = col1X + col1Width;
      const col3X = col2X + col2Width;

      // Draw header table borders
      // Top border
      page.drawLine({
        start: { x: 40, y: headerY + headerHeight },
        end: { x: width - 40, y: headerY + headerHeight },
        thickness: 1.5,
        color: rgb(0, 0, 0),
      });

      // Bottom border
      page.drawLine({
        start: { x: 40, y: headerY },
        end: { x: width - 40, y: headerY },
        thickness: 1.5,
        color: rgb(0, 0, 0),
      });

      // Left vertical border
      page.drawLine({
        start: { x: 40, y: headerY },
        end: { x: 40, y: headerY + headerHeight },
        thickness: 1.5,
        color: rgb(0, 0, 0),
      });

      // Right vertical border
      page.drawLine({
        start: { x: width - 40, y: headerY },
        end: { x: width - 40, y: headerY + headerHeight },
        thickness: 1.5,
        color: rgb(0, 0, 0),
      });

      // Column separator 1 (after logo)
      page.drawLine({
        start: { x: col2X, y: headerY },
        end: { x: col2X, y: headerY + headerHeight },
        thickness: 1.5,
        color: rgb(0, 0, 0),
      });

      // Column separator 2 (after center)
      page.drawLine({
        start: { x: col3X, y: headerY },
        end: { x: col3X, y: headerY + headerHeight },
        thickness: 1.5,
        color: rgb(0, 0, 0),
      });

      // Left column: Artience Logo or Text
      try {
        const logoPath = path.join(__dirname, "../../assets/logo/artience.png");
        const logoBuffer = fs.readFileSync(logoPath);
        const logoImage = await pdfDoc.embedPng(logoBuffer);
        const logoDims = logoImage.scale(0.15);
        page.drawImage(logoImage, {
          x: col1X + (col1Width - logoDims.width) / 2,
          y: headerY + (headerHeight - logoDims.height) / 2,
          width: logoDims.width,
          height: logoDims.height,
        });
      } catch (e) {
        console.error(
          "Logo file not found, using text. Path:",
          path.join(__dirname, "../../assets/logo/artience.png")
        );
        const logoText = "artience";
        const logoTextWidth = boldFont.widthOfTextAtSize(logoText, 18);
        page.drawText(logoText, {
          x: col1X + (col1Width - logoTextWidth) / 2,
          y: headerY + headerHeight / 2 - 6,
          size: 18,
          font: boldFont,
          color: rgb(0, 0, 0),
        });
      }

      // Center column: "DOCUMENT APPROVAL SHEET"
      const centerText = "DOCUMENT";
      const centerText2 = "APPROVAL SHEET";
      const centerTextWidth = boldFont.widthOfTextAtSize(centerText, 14);
      const centerText2Width = boldFont.widthOfTextAtSize(centerText2, 14);

      page.drawText(centerText, {
        x: col2X + (col2Width - centerTextWidth) / 2,
        y: headerY + headerHeight / 2 + 8,
        size: 14,
        font: boldFont,
        color: rgb(0, 0, 0),
      });

      page.drawText(centerText2, {
        x: col2X + (col2Width - centerText2Width) / 2,
        y: headerY + headerHeight / 2 - 8,
        size: 14,
        font: boldFont,
        color: rgb(0, 0, 0),
      });

      // Right column: "PT. TOYO INK INDONESIA"
      const rightText1 = "PT. TOYO INK";
      const rightText2 = "INDONESIA";
      const rightText1Width = boldFont.widthOfTextAtSize(rightText1, 12);
      const rightText2Width = boldFont.widthOfTextAtSize(rightText2, 12);

      page.drawText(rightText1, {
        x: col3X + (col3Width - rightText1Width) / 2,
        y: headerY + headerHeight / 2 + 8,
        size: 12,
        font: boldFont,
        color: rgb(0, 0, 0),
      });

      page.drawText(rightText2, {
        x: col3X + (col3Width - rightText2Width) / 2,
        y: headerY + headerHeight / 2 - 8,
        size: 12,
        font: boldFont,
        color: rgb(0, 0, 0),
      });

      yPosition = headerY - 30;

      // Document Information Section
      page.drawText("DOCUMENT INFORMATION", {
        x: 55,
        y: yPosition,
        size: 12,
        font: boldFont,
      });

      yPosition -= 20;

      const docInfo = [
        { label: "Document Code", value: documentData.documentCode },
        { label: "Document Name", value: documentData.name },
        { label: "Department", value: documentData.department.name },
        {
          label: "Category",
          value: this.formatCategory(documentData.category),
        },
        {
          label: "Revision",
          value: documentData.revision.toString().padStart(2, "0"),
        },
        {
          label: "Release Date",
          value: new Date(documentData.releaseDate).toLocaleDateString("id-ID"),
        },
        { label: "Uploaded By", value: documentData.uploader.fullName },
      ];

      const valueStartX = 180;
      const valueMaxWidth = width - 80 - valueStartX - 20; // right margin
      const lineHeight = 13;

      for (const info of docInfo) {
        const labelText = `${info.label}:`;
        const rawValue = info.value || "-";
        const lines = this._wrapText(rawValue, regularFont, 9, valueMaxWidth);

        // Draw label on first line
        page.drawText(labelText, {
          x: 60,
          y: yPosition,
          size: 9,
          font: boldFont,
          color: rgb(0, 0, 0),
        });

        // Draw each wrapped value line
        for (let li = 0; li < lines.length; li++) {
          page.drawText(lines[li], {
            x: valueStartX,
            y: yPosition - li * lineHeight,
            size: 9,
            font: regularFont,
            color: rgb(0, 0, 0),
          });
        }

        yPosition -= lines.length * lineHeight + 3;
      }

      yPosition -= 20;

      // Approval Signatures Section (Merged with References)
      page.drawText("APPROVAL SIGNATURES", {
        x: 55,
        y: yPosition,
        size: 12,
        font: boldFont,
      });

      yPosition -= 20;

      // Table styling
      const tableX = 55;
      const colWidths = [120, 130, 100, 70, 70]; // Adjusted: Workflow Step, Name, Position, Status, Date
      const tableHeaders = [
        "Level",
        "Approver Name",
        "Position",
        "Status",
        "Date",
      ];

      // Draw Table Headers
      let currentX = tableX;
      tableHeaders.forEach((header, i) => {
        page.drawText(header, {
          x: currentX,
          y: yPosition,
          size: 9,
          font: boldFont,
        });
        currentX += colWidths[i];
      });

      yPosition -= 5;
      page.drawLine({
        start: { x: tableX, y: yPosition },
        end: { x: width - 55, y: yPosition },
        thickness: 1,
      });
      yPosition -= 15;

      // Collect all signature steps in logical order: QA -> References -> Higher Levels
      const signatureSteps = [];

      // 1. QA Level 1
      const lvl1Approvals = approvals.filter(a => a.level === 1);
      lvl1Approvals.forEach(a => {
        signatureSteps.push({
          step: "Checked by QA Team",
          name: a.approver.fullName || "-",
          position: a.approver.position || a.approver.role?.name || "QA Team",
          status: a.status.toUpperCase(),
          date: a.approvedAt ? new Date(a.approvedAt).toLocaleDateString("id-ID") : "-"
        });
      });

      // 2. References (inserted after Level 1)
      if (documentData.references && documentData.references.length > 0) {
        // Deduplicate references by referenceId
        const uniqueRefs = documentData.references.filter(
          (ref, index, self) =>
            index === self.findIndex((r) => r.referenceId === ref.referenceId)
        );

        for (const ref of uniqueRefs) {
          const refCode = ref.reference.code.toUpperCase();
          let checkerPosition = "Checker";
          if (refCode.includes("SJPH")) checkerPosition = "SJPH rep.";
          else if (refCode.includes("ISO")) checkerPosition = "QMR rep.";
          else if (refCode.includes("HALAL")) checkerPosition = "Halal rep.";

          signatureSteps.push({
            step: "Reference Approve",
            name: ref.checker?.fullName || ref.reference?.checker?.fullName || "-",
            position: `${ref.reference.name} (${checkerPosition})`,
            status: ref.status ? ref.status.toUpperCase() : "PENDING",
            date: ref.checkedAt ? new Date(ref.checkedAt).toLocaleDateString("id-ID") : "-"
          });
        }
      }

      // 3. Higher Levels (2+)
      const higherApprovals = approvals.filter(a => a.level > 1);
      higherApprovals.forEach(a => {
        signatureSteps.push({
          step: `Lvl ${a.level - 1}`, // Display level relative to department hierarchy (starts from Lvl 1)
          name: a.approver.fullName || "-",
          position: a.approver.position || a.approver.role?.name || "-",
          status: a.status.toUpperCase(),
          date: a.approvedAt ? new Date(a.approvedAt).toLocaleDateString("id-ID") : "-"
        });
      });

      // Draw Rows
      for (const step of signatureSteps) {
        currentX = tableX;
        const row = [
          step.step,
          step.name,
          step.position,
          step.status,
          step.date,
        ];

        row.forEach((text, i) => {
          // Truncate text if it's too long for the column (especially for position)
          let displayText = text;
          const maxChar = [22, 25, 20, 15, 15][i];
          if (displayText.length > maxChar) {
            displayText = displayText.substring(0, maxChar - 3) + "...";
          }

          page.drawText(displayText, {
            x: currentX,
            y: yPosition,
            size: 8,
            font: regularFont,
          });
          currentX += colWidths[i];
        });
        yPosition -= 15;
      }

      // QR Code and Verification
      yPosition -= 40; // Space after table
      const qrCodeData = await this.generateQRCode(documentData);
      const qrImage = await pdfDoc.embedPng(qrCodeData);
      const qrDims = qrImage.scale(0.3);

      page.drawImage(qrImage, {
        x: 60,
        y: yPosition - qrDims.height,
        width: qrDims.width,
        height: qrDims.height,
      });

      const message = "Scan QR Code to verify document authenticity";
      page.drawText(message, {
        x: 60,
        y: yPosition - qrDims.height - 10,
        size: 8,
        font: regularFont,
        color: rgb(0.4, 0.4, 0.4),
      });

      // Issue Note
      page.drawText(
        "This is a computer-generated document. No signature is required.",
        {
          x: 60,
          y: 60,
          size: 8,
          font: regularFont,
          color: rgb(0.5, 0.5, 0.5),
        }
      );

      const pdfBytes = await pdfDoc.save();
      return Buffer.from(pdfBytes);
    } catch (error) {
      console.error("Error generating cover page:", error);
      throw new Error(`Failed to generate cover page: ${error.message}`);
    }
  }

  /**
   * Generate QR code for document verification
   * @param {Object} documentData - Document data
   * @returns {Promise<Buffer>} - QR code image buffer
   */
  async generateQRCode(documentData) {
    try {
      // Use PUBLIC_URL from env for the verification page URL
      const publicUrl =
        process.env.PUBLIC_URL ||
        process.env.APP_BASE_URL ||
        "http://localhost:5173";

      // QR code contains only the URL to verification page
      // The verification page will display all document details
      const verificationUrl = `${publicUrl}/verify/${documentData.id}`;

      const qrCodeBuffer = await QRCode.toBuffer(verificationUrl, {
        errorCorrectionLevel: "H",
        type: "png",
        width: 200,
        margin: 1,
      });

      return qrCodeBuffer;
    } catch (error) {
      console.error("Error generating QR code:", error);
      throw new Error(`Failed to generate QR code: ${error.message}`);
    }
  }

  /**
   * Merge cover page with original PDF
   * @param {Buffer} coverPageBuffer - Cover page PDF buffer
   * @param {Buffer} originalPdfBuffer - Original PDF buffer
   * @returns {Promise<Buffer>} - Merged PDF buffer
   */
  async mergePDFs(coverPageBuffer, originalPdfBuffer) {
    try {
      const coverPdf = await PDFDocument.load(coverPageBuffer);
      const originalPdf = await PDFDocument.load(originalPdfBuffer);

      const mergedPdf = await PDFDocument.create();

      // Copy cover page
      const [coverPage] = await mergedPdf.copyPages(coverPdf, [0]);
      mergedPdf.addPage(coverPage);

      // Copy all pages from original PDF
      const originalPages = await mergedPdf.copyPages(
        originalPdf,
        originalPdf.getPageIndices()
      );
      originalPages.forEach((page) => mergedPdf.addPage(page));

      const mergedPdfBytes = await mergedPdf.save();
      return Buffer.from(mergedPdfBytes);
    } catch (error) {
      console.error("Error merging PDFs:", error);
      throw new Error(`Failed to merge PDFs: ${error.message}`);
    }
  }

  /**
   * Wrap text to fit within maxWidth using pdf-lib font metrics.
   * @param {string} text - Text to wrap
   * @param {PDFFont} font - pdf-lib font object
   * @param {number} fontSize - Font size in points
   * @param {number} maxWidth - Maximum line width in points
   * @returns {string[]} - Array of lines
   */
  _wrapText(text, font, fontSize, maxWidth) {
    const words = String(text).split(" ");
    const lines = [];
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);
      if (testWidth > maxWidth && currentLine !== "") {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines.length > 0 ? lines : ["-"];
  }

  /**
   * Format category name for display
   * @param {string} category - Category code
   * @returns {string} - Formatted category name
   */
  formatCategory(category) {
    const categoryMap = {
      form: "Form Document",
      standard: "Standard Document",
      instruksi_kerja: "Instruksi Kerja Document",
      procedure_mutu: "Procedure Mutu Document",
      manual: "Manual Document",
    };
    return categoryMap[category] || category;
  }
}

module.exports = new PDFGeneratorService();
