const ExcelJS = require("exceljs");
const prisma = require("../utils/prisma");
const fs = require("fs");
const path = require("path");

/**
 * Generates a Work Instruction Excel (.xlsx) file from structured templateData.
 * Layout matches the PDF template: header, sections table, attachments, signature footer.
 */
class WiExcelGeneratorService {
  /**
   * Generate an Excel buffer from documentData + templateData.
   * @param {Object} documentData  { documentCode, name, releaseDate, revision }
   * @param {Object} templateData  { sections, attachments, style }
   * @returns {Promise<Buffer>}
   */
  async generate(documentData, templateData) {
    const wb = new ExcelJS.Workbook();
    wb.creator = "DMS QA System";
    wb.created = new Date();

    const style = templateData.style || {};
    const fontFamily = style.fontFamily || "Arial";
    const headerBgColor = (style.headerBgColor || "#ffe699").replace("#", "").toUpperCase();
    const topSections = templateData.topSections || [];
    const tableHeaderNumber = topSections.length + 1;
    const attachments = templateData.attachments || [];

    // Multi-page support: use pages array if available, otherwise single page from sections
    const pagesData = templateData.pages && templateData.pages.length > 0
      ? templateData.pages
      : [{ id: "default", sections: templateData.sections || [] }];
    const totalPages = pagesData.length;

    const effectiveDateRaw = documentData.releaseDate || documentData.createdAt || new Date();
    const effectiveDateStr = new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(new Date(effectiveDateRaw));

    // Check if ANY section across all pages is sectionless
    const isSectionlessMode = pagesData.some(page =>
      (page.sections || []).some(sec => sec.isSectionless)
    );

    // Build each page as a separate worksheet
    let currentSectionOffset = 0;
    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      const pageNum = pageIdx + 1;
      const sheetName = totalPages === 1 ? "Work Instruction" : `Page ${pageNum}`;
      const pageSections = pagesData[pageIdx].sections || [];

      const ws = wb.addWorksheet(sheetName, {
        pageSetup: {
          paperSize: 9, // A4
          orientation: "portrait",
          fitToPage: true,
          fitToWidth: 1,
          margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
        },
      });

      // Column widths: No(6) | Work Steps(50) | Check Points(25) | Working Pictures(30)
      ws.columns = [
        { width: 15 },
        { width: 45 },
        { width: 25 },
        { width: 30 },
      ];

      let row = 1;

      // ═══════════════════════════════════════════════════════
      // HEADER SECTION (with correct page number)
      // ═══════════════════════════════════════════════════════
      row = this._buildHeader(ws, wb, row, documentData, fontFamily, pageNum, totalPages, effectiveDateStr);

      if (pageIdx === 0) {
        // ═══════════════════════════════════════════════════════
        // TOP SECTIONS
        // ═══════════════════════════════════════════════════════
        row = this._buildTopSections(ws, row, topSections, fontFamily, headerBgColor);

        // ═══════════════════════════════════════════════════════
        // TABLE HEADER ROW (Section 5 typically)
        // ═══════════════════════════════════════════════════════
        row = this._buildTableTitleRow(ws, row, tableHeaderNumber, fontFamily, headerBgColor);
        row = this._buildInstructionTextRow(ws, row, templateData.instructionText, fontFamily);
      }
      row = this._buildTableHeader(ws, row, fontFamily, headerBgColor);

      // ═══════════════════════════════════════════════════════
      // SECTIONS (page-specific langkah kerja)
      // ═══════════════════════════════════════════════════════
      for (let sIdx = 0; sIdx < pageSections.length; sIdx++) {
        const sec = pageSections[sIdx];
        const numChar = String(currentSectionOffset + sIdx + 1);
        if (!sec.isContinued && !isSectionlessMode) {
          row = this._buildSectionTitleRow(ws, row, numChar, sec.title || "", fontFamily, headerBgColor);
        }
        for (let stIdx = 0; stIdx < (sec.steps || []).length; stIdx++) {
          const step = sec.steps[stIdx];
          row = await this._buildStepRow(ws, wb, row, isSectionlessMode ? null : numChar, stIdx + 1, step, fontFamily);
        }
      }

      // ═══════════════════════════════════════════════════════
      // ATTACHMENTS (shared, shown ONLY on the last page)
      // ═══════════════════════════════════════════════════════
      if (pageIdx === totalPages - 1) {
        row = this._buildAttachments(ws, row, attachments, fontFamily, headerBgColor);
      }

      // Update offset for next page
      currentSectionOffset += pageSections.length;
    }

    // Generate buffer
    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // ─────────────────────────────────────────────────────────
  // HEADER
  // ─────────────────────────────────────────────────────────
  _buildHeader(ws, wb, startRow, docData, fontFamily, pageNum = 1, totalPages = 1, effectiveDateStr = "") {
    let r = startRow;

    // ── Row 1 ──
    // Cell A1: artience logo
    const logoCell = ws.getCell(r, 1);
    const logoPath = path.join(__dirname, "../../assets/logo/artience.png");
    if (fs.existsSync(logoPath)) {
      const logoId = wb.addImage({
        filename: logoPath,
        extension: "png",
      });
      ws.addImage(logoId, {
        tl: { col: 0.1, row: r - 1 + 0.1 },
        ext: { width: 100, height: 35 },
      });
      logoCell.value = "";
    } else {
      logoCell.value = "artience";
      logoCell.font = { name: fontFamily, size: 18, bold: true, color: { argb: "FF004D40" } };
      logoCell.alignment = { horizontal: "center", vertical: "middle" };
    }
    this._setBorder(logoCell);

    // Cell B1:D1: Title
    ws.mergeCells(r, 2, r, 4);
    const titleCell = ws.getCell(r, 2);
    titleCell.value = {
      richText: [
        { font: { name: fontFamily, size: 12, bold: true, color: { argb: "FF000080" } }, text: "INSTRUKSI KERJA / WORK INSTRUCTION\n" },
        { font: { name: fontFamily, size: 12, bold: true, color: { argb: "FF000080" } }, text: (docData.name || "PENDAFTARAN DOKUMEN / REGISTRATION OF DOCUMENTS").toUpperCase() },
      ],
    };
    titleCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    this._setBorder(titleCell); // Applies border to the top-left of the merged area
    // Ensure the other merged cells have their borders set
    this._setBorder(ws.getCell(r, 3));
    this._setBorder(ws.getCell(r, 4));

    ws.getRow(r).height = 40;

    // ── Row 2 ──
    const revision = docData.revision
      ? String(docData.revision).padStart(2, "0")
      : "00";

    const metaItems = [
      `No. Dokumen : ${docData.documentCode || "TBD"}`,
      `Tanggal Efektif : ${effectiveDateStr}`,
      `Status revisi : ${revision}`,
      `Hal : ${pageNum} dari ${totalPages}`,
    ];

    for (let i = 0; i < metaItems.length; i++) {
      const cell = ws.getCell(r + 1, i + 1);
      cell.value = metaItems[i];
      cell.font = { name: fontFamily, size: 9 };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      this._setBorder(cell);
    }
    ws.getRow(r + 1).height = 18;

    return r + 2; // Return the next row to write to
  }

  // ─────────────────────────────────────────────────────────
  // TOP SECTIONS (e.g., Purpose, Scope, Reference, PPE)
  // ─────────────────────────────────────────────────────────
  _buildTopSections(ws, startRow, topSections, fontFamily, headerBgColor) {
    let r = startRow;

    for (let i = 0; i < topSections.length; i++) {
        const ts = topSections[i];
        const titleParts = (ts.title || "").split(" / ");

        // --- Title Row: "1  Tujuan / Purpose" ---
        // Apply border BEFORE merging (ExcelJS applies borders from the master cell)
        this._applyRowFrame(ws, r, false);
        ws.mergeCells(r, 1, r, 4);
        const titleCell = ws.getCell(r, 1);
        if (titleParts.length > 1) {
          titleCell.value = {
            richText: [
              { font: { name: fontFamily, size: 10, bold: true }, text: `${i + 1}  ${titleParts[0]} / ` },
              { font: { name: fontFamily, size: 10, bold: true, italic: true, color: { argb: "FF000080" } }, text: titleParts[1] },
            ],
          };
        } else {
          titleCell.value = `${i + 1}  ${ts.title}`;
          titleCell.font = { name: fontFamily, size: 10, bold: true };
        }
        titleCell.alignment = { vertical: "middle", wrapText: false };
        ws.getRow(r).height = 18;
        r++;

        // --- Content Rows (one per line) ---
        // --- Content Rows (one per line, preserving rich text) ---
        const richTextFragments = this._htmlToRichText(ts.text || "", fontFamily, 10);
        const richTextLines = this._splitRichTextByLines(richTextFragments);
        if (richTextLines.length === 0) richTextLines.push([]);

        for (let li = 0; li < richTextLines.length; li++) {
          this._applyRowFrame(ws, r, false);
          ws.mergeCells(r, 1, r, 4);
          const contentCell = ws.getCell(r, 1);
          
          const lineFragments = richTextLines[li];
          if (lineFragments.length > 0) {
             lineFragments[0].text = "    " + lineFragments[0].text;
             contentCell.value = { richText: lineFragments };
          } else {
             contentCell.value = "    ";
             contentCell.font = { name: fontFamily, size: 10 };
          }
          
          contentCell.alignment = { vertical: "top", wrapText: true };
          const textLength = lineFragments.reduce((sum, f) => sum + f.text.length, 0);
          ws.getRow(r).height = Math.max(15, Math.ceil(textLength / 110) * 15);
          r++;
        }

        // --- Attachments within Top Section (Reference) ---
        const tsAttachments = ts.attachments || [];
        for (let ai = 0; ai < tsAttachments.length; ai++) {
          const att = tsAttachments[ai];
          
          // No. and Text (A:C merged)
          ws.mergeCells(r, 1, r, 3);
          const attCell = ws.getCell(r, 1);
          attCell.value = `    ${ai + 1}. ${att.text || ""}`;
          attCell.font = { name: fontFamily, size: 9, color: { argb: "FF444444" } };
          attCell.alignment = { vertical: "middle", wrapText: true };
          attCell.border = { left: { style: "thin", color: { argb: "FF000000" } } };
          
          // Code (D)
          const codeCell = ws.getCell(r, 4);
          codeCell.value = att.code || "";
          codeCell.font = { name: fontFamily, size: 9, color: { argb: "FF000080" } };
          codeCell.alignment = { horizontal: "right", vertical: "middle" };
          codeCell.border = { right: { style: "thin", color: { argb: "FF000000" } } };
          
          ws.getRow(r).height = 16;
          r++;
        }
    }

    return r;
  }




  // ─────────────────────────────────────────────────────────
  // TABLE TITLE ROW (e.g., "5 Instruksi Kerja / Work Instruction")
  // ─────────────────────────────────────────────────────────
  _buildTableTitleRow(ws, startRow, number, fontFamily, headerBgColor) {
      const r = startRow;

      this._applyRowFrame(ws, r, false);
      ws.mergeCells(r, 1, r, 4);
      const titleCell = ws.getCell(r, 1);
      titleCell.value = {
        richText: [
          { font: { name: fontFamily, size: 10, bold: true }, text: `${number}  Instruksi Kerja / ` },
          { font: { name: fontFamily, size: 10, bold: true, italic: true, color: { argb: "FF000080" } }, text: "Work Instruction" },
        ],
      };
      titleCell.alignment = { vertical: "middle", wrapText: false };
      ws.getRow(r).height = 18;

      return r + 1;
  }


  // ─────────────────────────────────────────────────────────
  // INSTRUCTION TEXT ROW (below "5 Instruksi Kerja")
  // ─────────────────────────────────────────────────────────
  _buildInstructionTextRow(ws, startRow, text, fontFamily) {
      if (!text) return startRow;
      const r = startRow;

      this._applyRowFrame(ws, r, false);
      ws.mergeCells(r, 1, r, 4);
      const contentCell = ws.getCell(r, 1);
      const cleanText = this._stripHtml(text);
      const richTextFragments = this._htmlToRichText(text || "", fontFamily, 10);
      let plainTextLength = 0;
      let newlines = 1;
      
      if (richTextFragments.length > 0) {
          richTextFragments[0].text = "    " + richTextFragments[0].text;
          contentCell.value = { richText: richTextFragments };
          const plainText = richTextFragments.map(rt => rt.text).join("");
          plainTextLength = plainText.length;
          newlines = plainText.split("\n").length;
      } else {
          contentCell.value = "    ";
          contentCell.font = { name: fontFamily, size: 10 };
      }
      
      contentCell.alignment = { vertical: "top", wrapText: true };
      ws.getRow(r).height = Math.max(30, newlines * 15, Math.ceil(plainTextLength / 100) * 15);
      
      return r + 1;
  }

  // ─────────────────────────────────────────────────────────
  // TABLE HEADER (No | Work Steps | Check Points | Images)
  // ─────────────────────────────────────────────────────────
  _buildTableHeader(ws, startRow, fontFamily, headerBgColor) {
    const r = startRow;
    const headers = [
      "No",
      "Langkah Kerja / Work Steps",
      "Point Check / Check Points",
      "Gambar Kerja / Working Pictures",
    ];

    headers.forEach((text, col) => {
      const cell = ws.getCell(r, col + 1);
      cell.value = text;
      cell.font = { name: fontFamily, size: 10, bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${headerBgColor}` } };
      this._setBorder(cell);
    });

    ws.getRow(r).height = 28;
    return r + 1;
  }

  // ─────────────────────────────────────────────────────────
  // SECTION TITLE ROW
  // ─────────────────────────────────────────────────────────
  _buildSectionTitleRow(ws, startRow, sectionNum, title, fontFamily, headerBgColor) {
    const r = startRow;

    const noCell = ws.getCell(r, 1);
    noCell.value = sectionNum;
    noCell.font = { name: fontFamily, size: 11, bold: true };
    noCell.alignment = { horizontal: "center", vertical: "middle" };
    noCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${headerBgColor}` } };
    this._setBorder(noCell);

    // Merge columns B-D for section title
    ws.mergeCells(r, 2, r, 4);
    const titleCell = ws.getCell(r, 2);
    titleCell.value = this._stripHtml(title || "");
    titleCell.font = { name: fontFamily, size: 11, bold: true };
    titleCell.alignment = { vertical: "middle", wrapText: true };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${headerBgColor}` } };
    this._setBorder(titleCell);

    // Ensure all merged cells have borders
    for (let c = 2; c <= 4; c++) {
      this._setBorder(ws.getCell(r, c));
    }

    ws.getRow(r).height = 22;
    return r + 1;
  }

  // ─────────────────────────────────────────────────────────
  // STEP ROW (with optional image)
  // ─────────────────────────────────────────────────────────
  async _buildStepRow(ws, wb, startRow, sectionNum, stepNum, step, fontFamily) {
    const r = startRow;

    // Column A: Step number (e.g. "2.1.")
    const noCell = ws.getCell(r, 1);
    noCell.value = sectionNum ? `${sectionNum}.${stepNum}.` : `${stepNum}.`;
    noCell.font = { name: fontFamily, size: 10, bold: true };
    noCell.alignment = { horizontal: "center", vertical: "top" };
    this._setBorder(noCell);

    // Column B: Work Steps text
    const stepsCell = ws.getCell(r, 2);
    const stepRichText = this._htmlToRichText(step.stepText || "", fontFamily, 10);
    if (stepRichText.length > 0) stepsCell.value = { richText: stepRichText };
    else stepsCell.value = "";
    stepsCell.alignment = { vertical: "top", wrapText: true };
    this._setBorder(stepsCell);

    // Column C: Check Points text
    const checkCell = ws.getCell(r, 3);
    const checkRichText = this._htmlToRichText(step.checkPointText || "-", fontFamily, 10);
    if (checkRichText.length > 0) checkCell.value = { richText: checkRichText };
    else checkCell.value = "-";
    checkCell.alignment = { vertical: "top", wrapText: true };
    this._setBorder(checkCell);

    // Column D: Image
    const imageCell = ws.getCell(r, 4);
    this._setBorder(imageCell);

    let rowHeight = 45; // minimum base height
    const stepImagesRaw = step.images || (step.image ? [step.image] : []);
    const processedImages = [];

    // First pass: resolve images and calculate final row height
    for (const imgPath of stepImagesRaw) {
      if (!imgPath) continue;
      try {
        const imageBuffer = await this._resolveImageBuffer(imgPath);
        if (imageBuffer) {
          const dimensions = this._getImageDimensions(imageBuffer.buffer);
          const maxWidth = 80;
          const scale = Math.min(1, maxWidth / dimensions.width);
          let displayWidth = Math.round(dimensions.width * scale);
          let displayHeight = Math.round(dimensions.height * scale);
          
          if (displayHeight > 80) {
              const hScale = 80 / displayHeight;
              displayHeight = 80;
              displayWidth = Math.round(displayWidth * hScale);
          }
          
          processedImages.push({
             buffer: imageBuffer.buffer,
             extension: imageBuffer.extension,
             displayWidth,
             displayHeight,
             heightPoints: Math.round(displayHeight / 1.33)
          });
        }
      } catch (err) {
        console.error(`Failed to embed image for step ${sectionNum}.${stepNum}:`, err.message);
      }
    }

    // Second pass: embed images side-by-side horizontally with wrapping
    let xOffset = 5; // Start 5px margin
    let yOffsetPoints = 5; // Start 5px top margin
    let currentRowHeight = 0;
    const MAX_WIDTH_PX = 190; // Column D width is approx 210px, leaving some margin

    for (const pImage of processedImages) {
        // Check if image exceeds column width (and it's not the first image in the row)
        if (xOffset > 5 && (xOffset + pImage.displayWidth > MAX_WIDTH_PX)) {
            // Wrap to next line
            xOffset = 5;
            yOffsetPoints += currentRowHeight + 5; // Move down by the tallest image in the previous row + gap
            currentRowHeight = 0; // Reset for the new row
        }

        const imageId = wb.addImage({
            buffer: pImage.buffer,
            extension: pImage.extension,
        });

        ws.addImage(imageId, {
            tl: { 
                nativeCol: 3, // Column D (0-indexed 3)
                nativeColOff: Math.round(xOffset * 9525), // 1px ≈ 9525 EMUs
                nativeRow: r - 1,
                nativeRowOff: Math.round(yOffsetPoints * 9525)
            },
            ext: { width: pImage.displayWidth, height: pImage.displayHeight },
            editAs: 'oneCell'
        });

        xOffset += pImage.displayWidth + 5; // Image width + 5px gap
        
        // Track the tallest image in the current row to know how far to move down next time
        if (pImage.heightPoints > currentRowHeight) {
            currentRowHeight = pImage.heightPoints;
        }
    }

    // Dynamic row height based on final layout
    let totalHeightNeeded = yOffsetPoints + currentRowHeight + 10; // add some bottom padding
    rowHeight = Math.max(45, totalHeightNeeded);
    
    ws.getRow(r).height = rowHeight;
    return r + 1;
  }

  // ─────────────────────────────────────────────────────────
  // ATTACHMENTS
  // ─────────────────────────────────────────────────────────
  _buildAttachments(ws, startRow, attachments, fontFamily, headerBgColor) {
    let r = startRow;

    // Header row: "Lampiran / Attachment"
    ws.mergeCells(r, 1, r, 4);
    const headerCell = ws.getCell(r, 1);
    headerCell.value = "Lampiran / Attachment";
    headerCell.font = { name: fontFamily, size: 10, bold: true };
    headerCell.alignment = { vertical: "middle" };
    headerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${headerBgColor}` } };
    for (let c = 1; c <= 4; c++) this._setBorder(ws.getCell(r, c));
    ws.getRow(r).height = 22;
    r++;

    if (attachments.length > 0) {
      attachments.forEach((att, i) => {
        // Merge columns 1 to 3 for the text
        ws.mergeCells(r, 1, r, 3);
        const textCell = ws.getCell(r, 1);
        textCell.value = `${i + 1}. ${att.text || ""}`;
        textCell.font = { name: fontFamily, size: 10 };
        textCell.alignment = { vertical: "top", wrapText: true };
        
        // Column 4 for the document code
        const codeCell = ws.getCell(r, 4);
        codeCell.value = att.code || "";
        codeCell.font = { name: fontFamily, size: 10 };
        codeCell.alignment = { vertical: "top", horizontal: "right" };
        
        for (let c = 1; c <= 4; c++) this._setBorder(ws.getCell(r, c));
        
        // Ensure height scales with text wrap
        const newlines = (att.text || "").split("\n").length;
        const textLength = (att.text || "").length;
        ws.getRow(r).height = Math.max(20, newlines * 15, Math.ceil(textLength / 60) * 15);
        r++;
      });
    } else {
      ws.mergeCells(r, 1, r, 4);
      const contentCell = ws.getCell(r, 1);
      contentCell.value = "Tidak ada lampiran.";
      contentCell.font = { name: fontFamily, size: 10, italic: true, color: { argb: "FF808080" } };
      contentCell.alignment = { vertical: "top", wrapText: true };
      for (let c = 1; c <= 4; c++) this._setBorder(ws.getCell(r, c));
      ws.getRow(r).height = 22;
      r++;
    }

    return r;
  }

  // ─────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────

  _stripHtml(html) {
    if (!html) return "";
    let text = html.toString();
    // Convert <br> and <p> blocks to newlines
    text = text.replace(/<br\s*[\/]?>/gi, "\n");
    text = text.replace(/<\/p>\s*<p>/gi, "\n\n");
    text = text.replace(/<\/p>/gi, "\n");
    text = text.replace(/<p>/gi, "");
    // Convert list items
    text = text.replace(/<li>/gi, "• ");
    text = text.replace(/<\/li>/gi, "\n");
    // Strip all remaining HTML tags
    text = text.replace(/<[^>]+>/g, "");
    // Decode common entities
    text = text.replace(/&nbsp;/gi, " ");
    text = text.replace(/&amp;/gi, "&");
    text = text.replace(/&lt;/gi, "<");
    text = text.replace(/&gt;/gi, ">");
    text = text.replace(/&quot;/gi, '"');
    text = text.replace(/&#039;/gi, "'");
    // Strip invisible formatting characters (zero width spaces, soft hyphens)
    text = text.replace(/[\u200B-\u200D\uFEFF\xAD]/g, '');
    return text.trim();
  }

  _htmlToRichText(html, defaultFontFamily, defaultSize = 10) {
    if (!html) return [];
    
    // Remove raw newlines to prevent double-spacing since we infer newlines from block tags like <p> and <br>
    let text = html.toString().replace(/\r?\n/g, "");
    
    const richText = [];
    let currentPos = 0;
    
    let isBold = false;
    let isItalic = false;
    let isUnderline = false;
    let colorStack = [];
    
    const tagRegex = /<\/?([a-z0-9]+)([^>]*)>/gi;
    let match;
    
    while ((match = tagRegex.exec(text)) !== null) {
      // Process text before the tag
      if (match.index > currentPos) {
        let chunk = text.substring(currentPos, match.index);
        chunk = this._decodeEntities(chunk);
        if (chunk.length > 0) {
          const font = { name: defaultFontFamily, size: defaultSize };
          if (isBold) font.bold = true;
          if (isItalic) font.italic = true;
          if (isUnderline) font.underline = true;
          if (colorStack.length > 0) font.color = { argb: colorStack[colorStack.length - 1].color };
          richText.push({ font, text: chunk });
        }
      }
      
      const isClosing = match[0].startsWith('</');
      const tagName = match[1].toLowerCase();
      const attrs = match[2];
      
      if (!isClosing) {
        if (tagName === 'br') {
            richText.push({ font: { name: defaultFontFamily, size: defaultSize }, text: "\n" });
        } else if (tagName === 'li') {
            richText.push({ font: { name: defaultFontFamily, size: defaultSize }, text: "• " });
        }
        
        if (tagName === 'strong' || tagName === 'b') isBold = true;
        if (tagName === 'em' || tagName === 'i') isItalic = true;
        if (tagName === 'u') isUnderline = true;
        
        // Extract color from style attribute for ANY tag
        if (attrs.includes('color:')) {
           const colorMatch = attrs.match(/color:\s*(rgb\([^\)]+\)|#[a-fA-F0-9]+|[a-zA-Z]+)/i);
           if (colorMatch) {
             const colStr = colorMatch[1];
             let colorCode = undefined;
             if (colStr.toLowerCase().startsWith('rgb')) {
               const rgbMatch = colStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
               if (rgbMatch) {
                 const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
                 const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
                 const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
                 colorCode = `FF${r}${g}${b}`.toUpperCase();
               }
             } else if (colStr.startsWith('#')) {
               let hex = colStr.replace('#', '');
               if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
               colorCode = `FF${hex}`.toUpperCase();
             }
             if (colorCode) {
                 colorStack.push({ tag: tagName, color: colorCode });
             }
           }
        }
      } else {
        if (tagName === 'strong' || tagName === 'b') isBold = false;
        if (tagName === 'em' || tagName === 'i') isItalic = false;
        if (tagName === 'u') isUnderline = false;
        if (tagName === 'p' || tagName === 'li') {
            // Block closing tags append a newline
            richText.push({ font: { name: defaultFontFamily, size: defaultSize }, text: "\n" });
        }
        
        // Remove from color stack if tag matches
        for (let i = colorStack.length - 1; i >= 0; i--) {
            if (colorStack[i].tag === tagName) {
                colorStack.splice(i, 1);
                break; // only remove the most recent one
            }
        }
      }
      
      currentPos = match.index + match[0].length;
    }
    
    // Process remaining text after the last tag
    if (currentPos < text.length) {
       let chunk = text.substring(currentPos);
       chunk = this._decodeEntities(chunk);
       if (chunk.length > 0) {
         const font = { name: defaultFontFamily, size: defaultSize };
         if (isBold) font.bold = true;
         if (isItalic) font.italic = true;
         if (isUnderline) font.underline = true;
         if (colorStack.length > 0) font.color = { argb: colorStack[colorStack.length - 1].color };
         richText.push({ font, text: chunk });
       }
    }
    
    // Cleanup zero-width spaces
    const cleanedRichText = [];
    for (let rt of richText) {
        rt.text = rt.text.replace(/[\u200B-\u200D\uFEFF\xAD]/g, '');
        if (rt.text.length > 0) {
            cleanedRichText.push(rt);
        }
    }
    
    // Trim trailing newlines from the entire array
    while (cleanedRichText.length > 0 && cleanedRichText[cleanedRichText.length - 1].text === "\n") {
        cleanedRichText.pop();
    }
    
    return cleanedRichText;
  }
  
  _decodeEntities(text) {
    return text
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#039;/gi, "'");
  }

  _splitRichTextByLines(richTextArray) {
    const lines = [];
    let currentLine = [];
    
    for (const fragment of richTextArray) {
      const parts = fragment.text.split('\n');
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) {
          lines.push(currentLine);
          currentLine = [];
        }
        if (parts[i].length > 0) {
          currentLine.push({ font: { ...fragment.font }, text: parts[i] });
        }
      }
    }
    lines.push(currentLine);
    return lines;
  }

  /**
   * Extract width/height from image buffer by reading PNG/JPEG headers.
   * Falls back to a reasonable default if format is unrecognized.
   */
  _getImageDimensions(buffer) {
    const defaultDim = { width: 300, height: 200 };
    try {
      // PNG: width at bytes 16-19, height at bytes 20-23 (big-endian)
      if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
        return {
          width: buffer.readUInt32BE(16),
          height: buffer.readUInt32BE(20),
        };
      }

      // JPEG: scan for SOF0 (0xFFC0) or SOF2 (0xFFC2) marker
      if (buffer[0] === 0xff && buffer[1] === 0xd8) {
        let offset = 2;
        while (offset < buffer.length - 8) {
          if (buffer[offset] !== 0xff) break;
          const marker = buffer[offset + 1];
          // SOF0, SOF1, SOF2
          if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
            return {
              height: buffer.readUInt16BE(offset + 5),
              width: buffer.readUInt16BE(offset + 7),
            };
          }
          const segLen = buffer.readUInt16BE(offset + 2);
          offset += 2 + segLen;
        }
      }

      return defaultDim;
    } catch {
      return defaultDim;
    }
  }

  /**
   * Apply left border, right border, and bottom border to a merged row.
   * In ExcelJS, the master cell (col 1) of the merge determines the border of the entire merged block.
   */
  _applyRowFrame(ws, r, withBottom) {
    const thin = { style: "thin", color: { argb: "FF000000" } };
    const cell = ws.getCell(r, 1);
    
    // Preserve existing borders if any
    const border = cell.border ? { ...cell.border } : {};
    border.left = thin;
    border.right = thin;
    if (withBottom) border.bottom = thin;
    
    cell.border = border;
  }

  /** Apply only left + right + bottom border (for plain-text section rows) */
  _setOuterBorder(cell) {
    cell.border = {
      left:   { style: "thin", color: { argb: "FF000000" } },
      right:  { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
    };
  }

  /** Apply thin black border to a cell */
  _setBorder(cell) {
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  }

  /**
   * Resolve image source to a raw buffer for ExcelJS.
   * Supports backend URL pattern (/wi/image/:id) and base64 data URLs.
   * @returns {Promise<{buffer: Buffer, extension: string} | null>}
   */
  async _resolveImageBuffer(imageSrc) {
    if (!imageSrc) return null;
    try {
      // Robust ID extraction using regex (matches /wi/image/{id} or /image-id)
      const match = String(imageSrc).match(/\/wi\/image\/(\d+)/) || String(imageSrc).match(/\/(\d+)$/);
      let imageId = null;
      
      if (match) {
        imageId = parseInt(match[1]);
      } else {
        const parts = String(imageSrc).split("/");
        const lastPart = parts[parts.length - 1].split("?")[0].split("#")[0];
        if (/^\d+$/.test(lastPart)) {
          imageId = parseInt(lastPart);
        }
      }

      if (imageId) {
        const image = await prisma.wi_template_image.findUnique({
          where: { id: imageId },
        });
        if (image) {
          const ext = this._mimeToExtension(image.mimeType);
          console.log(`[Excel Gen] Resolved image ${imageId} (${image.mimeType})`);
          return { buffer: Buffer.from(image.data), extension: ext };
        } else {
          console.warn(`[Excel Gen] Image ${imageId} not found in database for URL: ${imageSrc}`);
        }
      }

      // Base64 data URL
      if (imageSrc.startsWith("data:")) {
        const match64 = imageSrc.match(/^data:(image\/\w+);base64,(.+)$/);
        if (match64) {
          const ext = this._mimeToExtension(match64[1]);
          return { buffer: Buffer.from(match64[2], "base64"), extension: ext };
        }
      }

      console.warn(`[Excel Gen] Could not resolve image: ${imageSrc}`);
      return null;
    } catch (err) {
      console.error("[Excel Gen] Critical error resolving image:", err.message, "URL:", imageSrc);
      return null;
    }
  }

  /** Map MIME type to ExcelJS image extension */
  _mimeToExtension(mimeType) {
    const map = {
      "image/png": "png",
      "image/jpeg": "jpeg",
      "image/jpg": "jpeg",
      "image/gif": "gif",
      "image/webp": "png", // ExcelJS doesn't support webp, fallback to png
    };
    return map[mimeType] || "png";
  }
}

module.exports = new WiExcelGeneratorService();
