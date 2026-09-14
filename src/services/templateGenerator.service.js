const puppeteer = require("puppeteer");
const prisma = require("../utils/prisma");
const wiExcelGenerator = require("./wiExcelGenerator.service");
const fs = require("fs");
const path = require("path");

class TemplateGeneratorService {
  /**
   * Generates Excel and PDF buffers from structured templateData.
   * @param {Object} documentData Metadata (documentCode, name, releaseDate, revision)
   * @param {Object} templateData { sections, attachments, style }
   * @returns {Promise<{ excelBuffer: Buffer, pdfBuffer: Buffer }>}
   */
  async generateFiles(documentData, templateData) {
    try {
      const style = templateData.style || {};
      const fontFamily = style.fontFamily || "Arial";
      const fontSize = style.fontSize || 11;
      const textColor = style.textColor || "#000";
      const headerBg = style.headerBgColor || "#ffe699";
      const borderColor = style.borderColor || "#000";
      const borderWidth = style.borderWidth || 1;
      const cellPadding = style.cellPadding || 6;
      const colW = style.colWidths || { no: 5, steps: 45, checkPoints: 25, images: 25 };

      // Load logo for PDF
      const logoPath = path.join(__dirname, "../../assets/logo/artience.png");
      let logoBase64 = "";
      if (fs.existsSync(logoPath)) {
        logoBase64 = `data:image/png;base64,${fs.readFileSync(logoPath).toString("base64")}`;
      }

      // Multi-page support: use pages array if available, otherwise single page from sections
      const pagesData = templateData.pages && templateData.pages.length > 0
        ? templateData.pages
        : [{ id: "default", sections: templateData.sections || [] }];
      
      const effectiveDateRaw = documentData.releaseDate || documentData.createdAt || new Date();
      const effectiveDateStr = new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }).format(new Date(effectiveDateRaw));
      
      const revisionStr = documentData.revision ? String(documentData.revision).padStart(2, "0") : "00";

      const approvals = documentData.approvals || [];
      const hasCover = approvals.length > 0;
      const totalPages = pagesData.length + (hasCover ? 1 : 0);
      const wiTotalPages = pagesData.length; // Pages excluding cover

      // Pre-convert all step images to base64 data URLs for PDF rendering (across all pages)
      const resolvedPages = [];
      let totalSteps = 0;
      let totalImages = 0;
      let resolvedCount = 0;

      for (const pageData of pagesData) {
        const pageSections = JSON.parse(JSON.stringify(pageData.sections || []));
        for (const sec of pageSections) {
          for (const step of sec.steps || []) {
            totalSteps++;
            const rawImages = step.images || (step.image ? [step.image] : []);
            step._resolvedImages = [];
            for (const img of rawImages) {
              if (img) {
                totalImages++;
                const resolved = await this._resolveImageToBase64(img);
                if (resolved) {
                  step._resolvedImages.push(resolved);
                  resolvedCount++;
                }
              }
            }
          }
        }
        resolvedPages.push({ ...pageData, sections: pageSections });
      }

      console.log(`[PDF Gen] Multi-page processing: ${totalPages} pages, ${totalSteps} steps, ${resolvedCount}/${totalImages} images resolved.`);

      // Build topSections HTML — plain text style (no table borders), matching document style
      const topSectionsHtml = (templateData.topSections || [])
        .map((ts, idx) => {
          const titleHtml = ts.title && ts.title.includes(" / ")
            ? `${this._escapeHtml(ts.title.split(" / ")[0])} / <span style="color:#000080;font-style:italic;">${this._escapeHtml(ts.title.split(" / ")[1])}</span>`
            : this._escapeHtml(ts.title || "");

          const contentHtml = `<div style="margin-left:20px;font-size:${fontSize}px;line-height:1.5;white-space:pre-wrap;">${this._cleanInvisibleChars(ts.text || "")}</div>`;

          const attachmentsHtml = (ts.attachments || []).map((att, aIdx) => {
            const text = this._escapeHtml(att.text || "");
            const code = att.code ? this._escapeHtml(att.code) : "";
            return `
              <div style="margin-left:20px; font-size:${fontSize - 1}px; color:#444; border-top:1px solid #eee; padding:2px 0; display:flex; justify-content:between;">
                <span style="flex:1;">${aIdx + 1}. ${text}</span>
                ${code ? `<span style="color:#000080; font-family:monospace; margin-left:10px;">${code}</span>` : ""}
              </div>
            `;
          }).join("");

          return `
            <div style="margin-bottom:6px;">
              <div style="font-weight:bold;font-size:${fontSize}px;line-height:1.6;">
                ${idx + 1}&nbsp;&nbsp;${titleHtml}
              </div>
              ${contentHtml}
              ${attachmentsHtml ? `<div style="margin-top:2px;">${attachmentsHtml}</div>` : ""}
            </div>
          `;
        })
        .join("");


      // Table header number
      const tableHeaderNumber = (templateData.topSections || []).length + 1;

      // Build attachments HTML
      const attachmentsHtml = (templateData.attachments || [])
        .map((att, i) => {
          const text = this._escapeHtml(att.text || "");
          const code = att.code ? this._escapeHtml(att.code) : "";
          if (code) {
            return `
              <div style="padding:2px;">
                <table style="width:100%;border-collapse:collapse;" border="0">
                  <tr>
                    <td style="text-align:left;vertical-align:top;padding:0;font-size:${fontSize}px;word-break:normal;overflow-wrap:break-word;white-space:pre-wrap;">${i + 1}. ${text}</td>
                    <td style="text-align:right;vertical-align:top;padding:0;font-size:${fontSize}px;white-space:nowrap;width:30%;">
                      ${code}
                    </td>
                  </tr>
                </table>
              </div>
            `;
          }
          return `<div style="padding:2px;word-break:normal;overflow-wrap:break-word;white-space:pre-wrap;">${i + 1}. ${text}</div>`;
        })
        .join("");

      // Calculate global numbering for sections and steps
      const sectionNumbers = new Map();
      const stepNumbers = new Map();
      let globalMajor = 0;
      let globalMinor = 0;
      
      resolvedPages.forEach((page) => {
        (page.sections || []).forEach((sec) => {
          if (!sec.isContinued) {
            globalMajor++;
            globalMinor = 0;
          }
          sectionNumbers.set(sec.id, globalMajor);

          (sec.steps || []).forEach((step) => {
            globalMinor++;
            stepNumbers.set(step.id, globalMinor);
          });
        });
      });

      // Check if ANY section across all pages is sectionless
      const isSectionlessMode = resolvedPages.some(page =>
        (page.sections || []).some(sec => sec.isSectionless)
      );

      // Helper to build a single page HTML
      const buildPageHtml = (pageIndex, pageSections, wiPageNum) => {
        // pageIndex = absolute PDF page index (used for page-break logic)
        // wiPageNum = 1-based WI page number for display (excludes cover)
        const pageNum = wiPageNum;

        // Build sections HTML for this page
        const sectionsHtml = pageSections
          .map((sec, sIndex) => {
            const numChar = String(sectionNumbers.get(sec.id) || 1);
            const stepsHtml = (sec.steps || [])
              .map((step, stIdx) => {
                const stNum = stepNumbers.get(step.id) || (stIdx + 1);
                return `
                <tr style="page-break-inside: avoid;">
                  <td style="text-align:center;padding:${cellPadding}px;vertical-align:top;border:${borderWidth}px solid ${borderColor};font-weight:bold;">
                    ${isSectionlessMode ? `${stNum}.` : `${numChar}.${stNum}.`}
                  </td>
                  <td style="padding:${cellPadding}px;vertical-align:top;border:${borderWidth}px solid ${borderColor};word-break:normal;overflow-wrap:break-word;white-space:normal;">${this._cleanInvisibleChars(step.stepText || "")}</td>
                  <td style="padding:${cellPadding}px;vertical-align:top;border:${borderWidth}px solid ${borderColor};word-break:normal;overflow-wrap:break-word;white-space:normal;">${this._cleanInvisibleChars(step.checkPointText || "-")}</td>
                  <td style="text-align:center;padding:0;vertical-align:top;border:${borderWidth}px solid ${borderColor};height:100%;">
                    <div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:8px;width:100%;height:100%;">
                      ${(step._resolvedImages || []).map(img => `<img src="${img}" style="width:100%;height:auto;object-fit:contain;display:block;" />`).join("")}
                    </div>
                  </td>
                </tr>
                `;
              })
              .join("");

            const headerHtml = (sec.isContinued || isSectionlessMode) ? "" : `
              <tr style="background-color:${headerBg};page-break-inside: avoid;">
                <td style="text-align:center;padding:${cellPadding}px;font-weight:bold;font-size:${fontSize + 1}px;border:${borderWidth}px solid ${borderColor};">
                  ${numChar}
                </td>
                <td colspan="3" style="padding:${cellPadding}px;font-weight:bold;font-size:${fontSize + 1}px;border:${borderWidth}px solid ${borderColor};word-break:normal;overflow-wrap:break-word;white-space:normal;">
                  ${this._cleanInvisibleChars(sec.title || "")}
                </td>
              </tr>
            `;

            return `
              ${headerHtml}
              ${stepsHtml}
            `;
          })
          .join("");

        const pageBreakStyle = pageIndex > 0 ? 'page-break-before:always;' : '';

        return `
<div style="border:4px solid #000080;padding:2px;${pageBreakStyle};-webkit-box-decoration-break:clone;box-decoration-break:clone;">

  <table style="width:100%;border-collapse:collapse;table-layout:fixed;" border="0">
    <thead>
      <tr>
        <th style="padding:0;border:none;font-weight:normal;text-align:left;">
          <table style="width:100%;border-collapse:collapse;" border="0">
            <tbody>
              <!-- Row 1 -->
              <tr class="header-row-1">
                <td style="width:25%;height:70px;text-align:center;vertical-align:middle;border:${borderWidth}px solid ${borderColor};padding:4px;">
                  ${logoBase64 ? `<img src="${logoBase64}" style="max-height:48px; max-width:100%; display:block; margin:auto;" />` : `<h1 style="color:#004d40;margin:0;font-size:24px;"><strong>artience</strong></h1>`}
                </td>
                <td colspan="3" class="header-title-cell" style="width:75%;text-align:center;vertical-align:middle;color:#000080;border:${borderWidth}px solid ${borderColor};">
                  <h2 style="margin:0;font-size:16px;"><strong>INSTRUKSI KERJA / WORK INSTRUCTION</strong></h2>
                  <h2 style="margin:4px 0 0 0;font-size:16px;"><strong>${(documentData.name || 'PENDAFTARAN DOKUMEN / REGISTRATION OF DOCUMENTS').toUpperCase()}</strong></h2>
                </td>
              </tr>
              <!-- Row 2 -->
              <tr class="header-row-2">
                <td style="width:25%;font-size:10px;text-align:center;border:${borderWidth}px solid ${borderColor};padding:4px;">
                  <strong>No. Dokumen :</strong> ${documentData.documentCode || "TBD"}
                </td>
                <td style="width:35%;font-size:10px;text-align:center;border:${borderWidth}px solid ${borderColor};padding:4px;">
                  <strong>Tanggal Efektif :</strong> ${effectiveDateStr}
                </td>
                <td style="width:20%;font-size:10px;text-align:center;border:${borderWidth}px solid ${borderColor};padding:4px;">
                  <strong>Status revisi :</strong> ${revisionStr}
                </td>
                <td class="hal-stamp-cell" id="${pageIndex === (hasCover ? 1 : 0) ? 'hal-stamp-cell' : ''}" style="width:20%;font-size:10px;text-align:center;vertical-align:middle;border:${borderWidth}px solid ${borderColor};padding:4px;">
                   <!-- hal stamp -->
                 </td>
              </tr>
            </tbody>
          </table>
        </th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="padding:0;border:none;vertical-align:top;">

          ${pageIndex === (hasCover ? 1 : 0) ? `
            ${topSectionsHtml}

            <div style="margin-bottom:6px; margin-top:2px;">
              <div style="font-weight:bold;font-size:${fontSize}px;line-height:1.6;">
                ${tableHeaderNumber}&nbsp;&nbsp;Instruksi Kerja / <span style="color:#000080;font-style:italic;font-weight:normal;">Work Instruction</span>
              </div>
            </div>
          ` : ''}

          <table style="width:100%;border-collapse:collapse;margin-top:-1px;table-layout:fixed;" border="0">
            <thead>
              <tr style="background-color:${headerBg};">
                <th style="width:${colW.no}%;text-align:center;padding:${cellPadding}px;border:${borderWidth}px solid ${borderColor};">No</th>
                <th style="width:${colW.steps}%;text-align:center;padding:${cellPadding}px;border:${borderWidth}px solid ${borderColor};">Langkah Kerja / <span style="color:#000080;font-style:italic;">Work Steps</span></th>
                <th style="width:${colW.checkPoints}%;text-align:center;padding:${cellPadding}px;border:${borderWidth}px solid ${borderColor};">Point Check / <span style="color:#000080;font-style:italic;">Check Points</span></th>
                <th style="width:${colW.images}%;text-align:center;padding:${cellPadding}px;border:${borderWidth}px solid ${borderColor};">Gambar Kerja / <span style="color:#000080;font-style:italic;">Working Pictures</span></th>
              </tr>
            </thead>
            <tbody>${sectionsHtml}</tbody>
          </table>

          ${Number(pageNum) === Number(totalPages) ? `
          <table style="width:100%;border-collapse:collapse;margin-top:-1px;table-layout:fixed;border-bottom:${borderWidth}px solid ${borderColor};" border="0">
            <tbody>
              <tr style="background-color:${headerBg};">
                <td style="padding:${cellPadding}px;font-weight:bold;border:${borderWidth}px solid ${borderColor};">Lampiran / <span style="color:#000080;font-style:italic;">Attachment</span></td>
              </tr>
              <tr>
                <td style="padding:${cellPadding}px;border:${borderWidth}px solid ${borderColor};">
                  ${attachmentsHtml || '<span style="color:grey;font-style:italic;">Tidak ada lampiran.</span>'}
                </td>
              </tr>
            </tbody>
          </table>
          ` : ''}

        </td>
      </tr>
    </tbody>
  </table>
</div>`;
      };

      // Build all pages
      const allPagesHtml = [];
      
      // Page 1: Optional Approval Sheet
      if (hasCover) {
        allPagesHtml.push(this._generateApprovalSheetHtml(documentData, approvals, logoBase64, totalPages));
      }

      // Remaining Pages: Work Instruction Content
      resolvedPages.forEach((page, idx) => {
        const pageIdx = hasCover ? idx + 1 : idx;
        const wiPageNum = idx + 1; // Always 1-based, excluding cover
        const html = buildPageHtml(pageIdx, page.sections, wiPageNum);
        allPagesHtml.push(html);
      });

      const htmlContent = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { margin: 0; padding: 0; box-sizing: border-box; }
  p { margin: 0; padding: 0; }
</style>
</head>
<body style="font-family:'${fontFamily}',sans-serif;font-size:${fontSize}px;color:${textColor};padding:0;margin:0;">
${allPagesHtml.join("\n")}
</body></html>`;

      // ── PDF via Puppeteer ──
      const browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      
      let row1HeightPx = 70;
      let row2HeightPx = 20;
      let pdfBuffer = null;
      try {
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: "domcontentloaded", timeout: 60000 });
        
        // Wait for layout and transient renders
        await new Promise(r => setTimeout(r, 800));
        
        try {
          const heights = await page.evaluate(() => {
            const r1 = document.querySelector('.header-row-1');
            const titleCell = document.querySelector('.header-title-cell');
            const r2 = document.querySelector('.header-row-2');
            
            // Prefer the cell's height if it expanded more than 70px
            let h1 = r1 ? r1.getBoundingClientRect().height : 70;
            if (titleCell) {
               const cellHeight = titleCell.getBoundingClientRect().height;
               if (cellHeight > h1) h1 = cellHeight;
            }
            
            return {
              r1: h1,
              r2: r2 ? r2.getBoundingClientRect().height : 20
            };
          });
          row1HeightPx = heights.r1;
          row2HeightPx = heights.r2;
          console.log(`[PDF Gen] Measured Heights -> Row 1: ${row1HeightPx}px, Row 2: ${row2HeightPx}px`);
        } catch (err) {
          console.warn("Could not measure row heights, using fallbacks", err);
        }

        pdfBuffer = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "14.11mm", bottom: "14.11mm", left: "14.11mm", right: "14.11mm" },
        });
      } finally {
        await browser.close();
      }

      try {
        const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const pdfPages = pdfDoc.getPages();
        const totalPdfPages = pdfPages.length;
        const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const wiTotalInPdf = totalPdfPages - (hasCover ? 1 : 0);
        const startIdx = hasCover ? 1 : 0;

        // Puppeteer renders at 96 DPI, PDF is 72 DPI. So 1px = 0.75pt.
        const row1HeightPt = row1HeightPx * 0.75;
        const row2HeightPt = row2HeightPx * 0.75;
        
        // The table is always at the top of every physical page.
        // PDF Margin Top is 14.11mm = 40pt.
        // The wrapping div has a 4px (3pt) border and 2px (1.5pt) padding.
        // So the table begins exactly at 44.5pt from the top of the physical page.
        const tableTopPt = 44.5;
        
        // Row 2 starts exactly below Row 1
        const row2TopPt = tableTopPt + row1HeightPt;
        
        // Center of Row 2 is halfway down its height
        const row2CenterPt = row2TopPt + (row2HeightPt / 2);
        
        const fontSize = 9; // ~12px to match the HTML 10px visually
        
        // Text is drawn from baseline. The baseline is slightly below the center.
        const baselineFromTopPt = row2CenterPt + (fontSize * 0.3);
        const pdfY = 841.89 - baselineFromTopPt;
        
        console.log(`[PDF Gen] Calculated PDF Y: ${pdfY}`);

        for (let i = startIdx; i < pdfPages.length; i++) {
          const pdfPage = pdfPages[i];
          const wiNum = i - startIdx + 1;
          const text = `Hal : ${wiNum} dari ${wiTotalInPdf}`;
          const textWidth = helveticaBold.widthOfTextAtSize(text, fontSize);
          
          pdfPage.drawText(text, {
            x: 500 - textWidth / 2,
            y: pdfY,
            size: fontSize,
            font: helveticaBold,
            color: rgb(0, 0, 0)
          });
        }

        pdfBuffer = Buffer.from(await pdfDoc.save());
      } catch (pdfErr) {
        console.error("PDF-lib page numbering failed:", pdfErr.message);
        // Fallback: if pdf-lib completely fails, we have no page numbers, 
        // but this should not silently fail in development.
        fs.writeFileSync(path.join(__dirname, "../../pdf-error.log"), pdfErr.stack);
      }


      // ── Excel via wiExcelGenerator ──
      let excelBuffer = null;
      try {
        excelBuffer = await wiExcelGenerator.generate(documentData, templateData);
      } catch (excelError) {
        console.error("Excel generation failed (non-fatal):", excelError.message);
      }

      return {
        excelBuffer,
        pdfBuffer,
      };
    } catch (error) {
      console.error("TemplateGenerator error:", error);
      throw error;
    }
  }

  /**
   * Generates a landscape PDF for Record Documents (Plan Sheets).
   * @param {Object} record Data from record_document table
   * @returns {Promise<Buffer>}
   */
  async generateRecordPdf(record) {
    try {
      const logoPath = path.join(__dirname, "../../assets/logo/artience.png");
      let logoBase64 = "";
      if (fs.existsSync(logoPath)) {
        logoBase64 = `data:image/png;base64,${fs.readFileSync(logoPath).toString("base64")}`;
      }

      const data = record.data || {};
      const header = data.headerInfo || {};
      
      const thStyle = `background-color: #f8fafc; border: 1px solid #000; padding: 4px; font-size: 8px; font-weight: bold; text-align: center; color: #000;`;
      const tdStyle = `border: 1px solid #000; padding: 3px; font-size: 9px; vertical-align: top; color: #000; word-break: normal; overflow-wrap: break-word; white-space: pre-wrap;`;

      const sectionsHtml = (data.sections || []).map((section, sIdx) => {
        const rowsHtml = (section.rows || []).map((row, rIdx) => `
          <tr>
            <td style="${tdStyle} text-align: center; font-size: 8px;">${sIdx + 1}.${rIdx + 1}</td>
            <td style="${tdStyle}">${this._escapeHtml(row.sasaran || "")}</td>
            <td style="${tdStyle} font-size: 8px;">${this._escapeHtml(row.reference || "")}</td>
            <td style="${tdStyle}">${this._escapeHtml(row.alasan || "")}</td>
            <td style="${tdStyle} text-align: center;">${this._escapeHtml(row.target || "")}</td>
            <td style="${tdStyle} text-align: center;">${this._escapeHtml(row.satuan || "")}</td>
            <td style="${tdStyle}">${this._escapeHtml(row.metode || "")}</td>
            <td style="${tdStyle}">${this._escapeHtml(row.frekuensi || "")}</td>
            <td style="${tdStyle}">${this._escapeHtml(row.rencana || "")}</td>
            <td style="${tdStyle}">${this._escapeHtml(row.resources || "")}</td>
            <td style="${tdStyle}">${this._escapeHtml(row.pic || "")}</td>
            <td style="${tdStyle} text-align: center;">${this._escapeHtml(row.waktuStart || "")}</td>
            <td style="${tdStyle} text-align: center;">${this._escapeHtml(row.waktuFinish || "")}</td>
            <td style="${tdStyle}">${this._escapeHtml(row.pemeriksaan || "")}</td>
          </tr>
        `).join("");

        return `
          <tr style="background-color: #f1f5f9;">
            <td style="${tdStyle} text-align: center; font-weight: bold;">${sIdx + 1}</td>
            <td colspan="13" style="${tdStyle} font-weight: bold;">${this._escapeHtml(section.title || "Untitled Section")}</td>
          </tr>
          ${rowsHtml}
        `;
      }).join("");

      const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Arial', sans-serif; margin: 0; padding: 0; }
    .container { border: 2px solid #000080; padding: 1px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .header-table td { border: 1px solid #000; }
    .metadata-div { padding: 4px; font-size: 9px; font-weight: bold; line-height: 1.4; border-left: 1px solid #000; border-right: 1px solid #000; }
    .italic { font-style: italic; font-weight: normal; color: #000080; }
  </style>
</head>
<body>
  <div class="container">
    <table class="header-table">
      <tbody>
        <tr>
          <td rowspan="4" style="width: 20%; text-align: center; padding: 5px; border: 1px solid #000;">
            ${logoBase64 ? `<img src="${logoBase64}" style="max-height: 45px;" />` : "<strong>artience</strong>"}
          </td>
          <td rowspan="4" style="width: 60%; text-align: center; padding: 10px; border: 1px solid #000;">
            <div style="font-size: 11px; font-weight: bold; text-transform: uppercase;">LEMBAR RENCANA SASARAN MUTU DAN LINGKUNGAN / <span class="italic" style="font-size: 10px;">QUALITY AND ENVIRONMENTAL OBJECTIVE PLAN SHEET</span></div>
            <div style="font-size: 10px; font-weight: bold; margin-top: 5px;">PT. Toyo Ink Indonesia</div>
          </td>
          <td style="width: 20%; padding: 4px 8px; font-size: 9px; font-weight: bold; border: 1px solid #000;">No. Dokumen : ${header.docNo || "FRM / III / MR / 20"}</td>
        </tr>
        <tr>
          <td style="padding: 4px 8px; font-size: 9px; font-weight: bold; border: 1px solid #000;">Tanggal Efektif : ${header.effDate || "26 Maret 2024"}</td>
        </tr>
        <tr>
          <td style="padding: 4px 8px; font-size: 9px; font-weight: bold; border: 1px solid #000;">Status Revisi : ${header.revStatus || "05"}</td>
        </tr>
        <tr>
          <td style="padding: 4px 8px; font-size: 9px; font-weight: bold; border: 1px solid #000;">Halaman : 1 dari 1</td>
        </tr>
      </tbody>
    </table>

    <div class="metadata-div" style="padding: 8px 4px; border-left: 1px solid #000; border-right: 1px solid #000; border-bottom: 1px solid #000;">
      <div style="display: flex; margin-bottom: 3px;">
        <span style="width: 250px; font-weight: bold; font-size: 10px; color: #000;">Departemen / <span class="italic" style="color: #1e3a8a;">Departments</span></span> 
        <span style="font-weight: bold; font-size: 10px; color: #000;">: ${header.department || record.department?.name || "-"}</span>
      </div>
      <div style="display: flex; margin-bottom: 3px;">
        <span style="width: 250px; font-weight: bold; font-size: 10px; color: #000;">Periode / <span class="italic" style="color: #1e3a8a;">Period</span></span> 
        <span style="font-weight: bold; font-size: 10px; color: #000;">: ${header.period || record.period || "-"}</span>
      </div>
      <div style="display: flex; margin-bottom: 3px;">
        <span style="width: 250px; font-weight: bold; font-size: 10px; color: #000;">Tanggal Pembuatan / <span class="italic" style="color: #1e3a8a;">Create Date</span></span> 
        <span style="font-weight: bold; font-size: 10px; color: #000;">: ${header.createDate || "-"}</span>
      </div>
      <div style="display: flex; padding-bottom: 2px;">
        <span style="width: 250px; font-weight: bold; font-size: 10px; color: #000;">No. Revisi Isi / <span class="italic" style="color: #1e3a8a;">Content Revision No</span></span> 
        <span style="font-weight: bold; font-size: 10px; color: #000;">: ${header.contentRev || "00"}</span>
      </div>
      ${record.proposalObjective ? `<div style="display: flex; border-top: 1px solid #eee; margin-top: 2px; padding-top: 2px;"><span style="width: 200px;">Proposal Objective</span> : <span style="font-style: italic; font-weight: normal; color: #444;">${this._escapeHtml(record.proposalObjective)}</span></div>` : ""}
    </div>

    <table style="margin-top: -1px;">
      <thead>
        <tr>
          <th style="${thStyle} width: 2%;" rowspan="2">No</th>
          <th style="${thStyle} width: 11%;" rowspan="2">Sasaran Mutu dan Lingkungan / <br/><span class="italic">Quality and Environmental Objective</span></th>
          <th style="${thStyle} width: 15%;" rowspan="2">Reference</th>
          <th style="${thStyle} width: 7%;" rowspan="2">Alasan / <br/><span class="italic">Reason</span></th>
          <th style="${thStyle} width: 4%;" rowspan="2">Target</th>
          <th style="${thStyle} width: 4%;" rowspan="2">Satuan / <br/><span class="italic">Unit</span></th>
          <th style="${thStyle} width: 11%;" rowspan="2">Metode Pengukuran Target / <br/><span class="italic">Target Measurement Method</span></th>
          <th style="${thStyle} width: 6%;" rowspan="2">Frekuensi Pengukuran / <br/><span class="italic">Measurement Frequency</span></th>
          <th style="${thStyle} width: 12%;" rowspan="2">Rencana Kegiatan / <br/><span class="italic">Activity Plan</span></th>
          <th style="${thStyle} width: 9%;" rowspan="2">Sumber Daya / <br/><span class="italic">Resources</span></th>
          <th style="${thStyle} width: 7%;" rowspan="2">Penanggung Jawab / <br/><span class="italic">Person in charge</span></th>
          <th style="${thStyle} width: 6%;" colspan="2">Waktu / <span class="italic">Time</span></th>
          <th style="${thStyle} width: 6%;" rowspan="2">Pemeriksaan Tindakan / <br/><span class="italic">Action Check</span></th>
        </tr>
        <tr>
          <th style="${thStyle} width: 3%;">Mulai / <br/><span class="italic">Start</span></th>
          <th style="${thStyle} width: 3%;">Akhir / <br/><span class="italic">Finish</span></th>
        </tr>
      </thead>
      <tbody>
        ${sectionsHtml}
      </tbody>
    </table>
  </div>
</body>
</html>`;

      const browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      let pdfBuffer = null;
      try {
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: "domcontentloaded", timeout: 60000 });
        pdfBuffer = await page.pdf({
          format: "A4",
          landscape: true,
          printBackground: true,
          margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
        });
      } finally {
        await browser.close();
      }
      return pdfBuffer;
    } catch (error) {
      console.error("generateRecordPdf error:", error);
      throw error;
    }
  }

  /**
   * Generates a portrait PDF cover page for Record Documents.
   * @param {Object} record Data from record_document table
   * @param {Array} approvals List of approvals
   * @returns {Promise<Buffer>}
   */
  async generateRecordCoverPage(record, approvals) {
    try {
      const logoPath = path.join(__dirname, "../../assets/logo/artience.png");
      let logoBase64 = "";
      if (fs.existsSync(logoPath)) {
        logoBase64 = `data:image/png;base64,${fs.readFileSync(logoPath).toString("base64")}`;
      }

      const categoryLabel = {
        'quality_and_environmental': 'Quality and Environmental',
        'monitoring_quality_and_environmental': 'Monitoring Q&E',
        'management_of_change': 'Management of Change',
        'working_instructions': 'Working Instructions'
      }[record.category] || record.category;

      const approvalsHtml = (approvals || []).map(app => `
        <tr>
          <td style="border: 1px solid #000; padding: 8px; font-size: 10px;">Level ${app.level}</td>
          <td style="border: 1px solid #000; padding: 8px; font-size: 10px;">${this._escapeHtml(app.approver?.fullName || "-")}</td>
          <td style="border: 1px solid #000; padding: 8px; font-size: 10px;">${this._escapeHtml(app.approver?.position || app.approver?.role?.name || "-")}</td>
          <td style="border: 1px solid #000; padding: 8px; font-size: 10px; font-weight: bold; text-transform: uppercase; color: ${app.status === 'approved' ? 'green' : 'red'};">${app.status}</td>
          <td style="border: 1px solid #000; padding: 8px; font-size: 10px;">${this._formatDate(app.approvedAt)}</td>
        </tr>
      `).join("");

      const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Arial', sans-serif; margin: 0; padding: 40px; color: #333; }
    .header { display: flex; align-items: center; border: 2px solid #000; margin-bottom: 30px; }
    .logo-box { width: 180px; padding: 15px; border-right: 2px solid #000; display: flex; justify-content: center; align-items: center; }
    .title-box { flex: 1; padding: 15px; border-right: 2px solid #000; text-align: center; }
    .company-box { width: 180px; padding: 15px; text-align: center; font-weight: bold; }
    .section-title { font-size: 14px; font-weight: bold; margin-bottom: 15px; border-bottom: 1px solid #ccc; padding-bottom: 5px; color: #000080; }
    .info-grid { display: grid; grid-template-columns: 150px 1fr; gap: 10px; margin-bottom: 30px; font-size: 11px; }
    .info-label { font-weight: bold; color: #666; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th { background-color: #f2f2f2; border: 1px solid #000; padding: 10px; font-size: 11px; text-align: left; }
    .footer { position: fixed; bottom: 40px; font-size: 9px; color: #999; text-align: center; width: 100%; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo-box">
      <img src="${logoBase64}" style="max-height: 40px;" />
    </div>
    <div class="title-box">
      <h1 style="margin: 0; font-size: 18px;">RECORD</h1>
      <h2 style="margin: 0; font-size: 16px; font-weight: normal;">APPROVAL SHEET</h2>
    </div>
    <div class="company-box">
      PT. TOYO INK INDONESIA
    </div>
  </div>

  <div class="section-title">RECORD INFORMATION</div>
  <div style="font-size: 11px; margin-bottom: 30px; display: flex; flex-direction: column; gap: 6px;">
    <div style="display: flex; align-items: center;">
      <div style="width: 150px; font-weight: bold; color: #666; flex-shrink: 0;">Record Code:</div>
      <div>${record.documentCode || "-"}</div>
    </div>
    <div style="display: flex; flex-direction: column; gap: 4px; margin: 2px 0;">
      <div style="font-weight: bold; color: #666;">Record Name:</div>
      <div style="font-weight: bold; font-size: 12px; line-height: 1.5; padding-left: 12px; border-left: 3px solid #000080; word-break: break-word; overflow-wrap: break-word; white-space: normal;">${this._escapeHtml(record.name)}</div>
    </div>
    <div style="display: flex; align-items: center;">
      <div style="width: 150px; font-weight: bold; color: #666; flex-shrink: 0;">Category:</div>
      <div>${categoryLabel}</div>
    </div>
    <div style="display: flex; align-items: center;">
      <div style="width: 150px; font-weight: bold; color: #666; flex-shrink: 0;">Period:</div>
      <div>${record.period}</div>
    </div>
    <div style="display: flex; align-items: center;">
      <div style="width: 150px; font-weight: bold; color: #666; flex-shrink: 0;">Department:</div>
      <div>${record.department?.name || "-"}</div>
    </div>
    <div style="display: flex; align-items: center;">
      <div style="width: 150px; font-weight: bold; color: #666; flex-shrink: 0;">Uploader:</div>
      <div>${record.uploader?.fullName || "-"}</div>
    </div>
    <div style="display: flex; align-items: center;">
      <div style="width: 150px; font-weight: bold; color: #666; flex-shrink: 0;">Created At:</div>
      <div>${this._formatDate(record.createdAt)}</div>
    </div>
    ${record.proposalObjective ? `
    <div style="display: flex; align-items: center;">
      <div style="width: 150px; font-weight: bold; color: #666; flex-shrink: 0;">Proposal Objective:</div>
      <div style="font-style: italic; color: #555; word-break: break-word; overflow-wrap: break-word;">${this._escapeHtml(record.proposalObjective)}</div>
    </div>
    ` : ""}
  </div>

  <div class="section-title">APPROVAL SIGNATURES</div>
  <table>
    <thead>
      <tr>
        <th>Level</th>
        <th>Approver Name</th>
        <th>Position</th>
        <th>Status</th>
        <th>Date</th>
      </tr>
    </thead>
    <tbody>
      ${approvalsHtml}
    </tbody>
  </table>

  <div class="footer">
    This is a computer-generated document. No signature is required. Printed on ${this._formatDate(new Date())}
  </div>
</body>
</html>`;

      const browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      let pdfBuffer = null;
      try {
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: "domcontentloaded", timeout: 60000 });
        pdfBuffer = await page.pdf({
          format: "A4",
          landscape: false,
          printBackground: true,
          margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
        });
      } finally {
        await browser.close();
      }
      return pdfBuffer;
    } catch (error) {
      console.error("generateRecordCoverPage error:", error);
      throw error;
    }
  }

  /**
   * Generates HTML for the Work Instruction Approval Sheet (Cover Page).
   */
  _generateApprovalSheetHtml(documentData, approvals, logoBase64, totalPages) {
    const approvalsHtml = (approvals || []).map(app => `
      <tr>
        <td style="border: 1px solid #000; padding: 8px; font-size: 11px;">Level ${app.level}</td>
        <td style="border: 1px solid #000; padding: 8px; font-size: 11px;">${this._escapeHtml(app.approver?.fullName || "-")}</td>
        <td style="border: 1px solid #000; padding: 8px; font-size: 11px;">${this._escapeHtml(app.approver?.position || app.approver?.role?.name || "-")}</td>
        <td style="border: 1px solid #000; padding: 8px; font-size: 11px; font-weight: bold; text-transform: uppercase; color: ${app.status === 'approved' ? 'green' : (app.status === 'pending' ? '#d97706' : 'red')};">
          ${app.status}
        </td>
        <td style="border: 1px solid #000; padding: 8px; font-size: 11px;">${this._formatDate(app.approvedAt)}</td>
      </tr>
    `).join("");

    return `
<div style="border:4px solid #000080; padding:0; margin:0; min-height:900px; box-sizing:border-box;">
  <table style="width:100%; border-collapse:collapse;" border="0">
    <tbody>
      <tr>
        <td style="width:25%; height:80px; text-align:center; vertical-align:middle; border:1px solid #000; padding:4px;">
          ${logoBase64 ? `<img src="${logoBase64}" style="max-height:55px; max-width:100%;" />` : "<strong>artience</strong>"}
        </td>
        <td style="width:50%; text-align:center; vertical-align:middle; border:1px solid #000; color:#000080;">
          <h2 style="margin:0; font-size:18px;"><strong>DOCUMENT APPROVAL SHEET</strong></h2>
        </td>
        <td style="width:25%; text-align:center; vertical-align:middle; border:1px solid #000; font-weight:bold; font-size:14px;">
          PT. TOYO INK INDONESIA
        </td>
      </tr>
    </tbody>
  </table>

  <div style="padding:20px;">
    <h3 style="color:#000080; border-bottom:1px solid #ccc; padding-bottom:5px; font-size:14px;">DOCUMENT INFORMATION</h3>
    <div style="font-size:12px; margin-bottom:20px; display:flex; flex-direction:column; gap:8px;">
      <div style="display:flex; align-items:center;">
        <div style="width:150px; font-weight:bold; flex-shrink:0;">Document Code</div>
        <div>: ${documentData.documentCode || "-"}</div>
      </div>
      
      <div style="display:flex; flex-direction:column; margin:4px 0;">
        <div style="font-weight:bold; margin-bottom:4px;">Document Name :</div>
        <div style="font-weight:bold; font-size:13px; line-height:1.4; padding-left:12px; border-left:3px solid #000080; word-break:break-word; overflow-wrap:break-word; white-space:normal;">
          ${this._escapeHtml(documentData.name || "-")}
        </div>
      </div>
      
      <div style="display:flex; align-items:center;">
        <div style="width:150px; font-weight:bold; flex-shrink:0;">Category</div>
        <div>: Work Instruction</div>
      </div>
      <div style="display:flex; align-items:center;">
        <div style="width:150px; font-weight:bold; flex-shrink:0;">Revision</div>
        <div>: ${String(documentData.revision || 0).padStart(2, '0')}</div>
      </div>
      <div style="display:flex; align-items:center;">
        <div style="width:150px; font-weight:bold; flex-shrink:0;">Status</div>
        <div style="text-transform:uppercase; font-weight:bold;">: DRAFT / PENDING</div>
      </div>
    </div>

    <h3 style="color:#000080; border-bottom:1px solid #ccc; padding-bottom:5px; font-size:14px;">APPROVAL SIGNATURES</h3>
    <table style="width:100%; border-collapse:collapse; margin-top:10px;">
      <thead>
        <tr style="background-color:#f2f2f2;">
          <th style="border: 1px solid #000; padding: 10px; text-align:left; font-size:11px;">Level</th>
          <th style="border: 1px solid #000; padding: 10px; text-align:left; font-size:11px;">Approver Name</th>
          <th style="border: 1px solid #000; padding: 10px; text-align:left; font-size:11px;">Position</th>
          <th style="border: 1px solid #000; padding: 10px; text-align:left; font-size:11px;">Status</th>
          <th style="border: 1px solid #000; padding: 10px; text-align:left; font-size:11px;">Date</th>
        </tr>
      </thead>
      <tbody>
        ${approvalsHtml}
      </tbody>
    </table>
  </div>

  <div style="position:absolute; bottom:30px; left:20px; right:20px; font-size:10px; color:#999; text-align:center;">
    This is a computer-generated draft document for preview purpose. Page 1 of ${totalPages}
  </div>
</div>
<div style="page-break-after:always;"></div>
`;
  }

  /** Simple HTML escaping for plain text fields */
  _escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
      .replace(/\n/g, "<br/>");
  }

  /** Cleans invisible characters and converts non-breaking spaces to normal spaces so they can wrap */
  _cleanInvisibleChars(str) {
    if (!str) return "";
    return String(str)
      .replace(/[\u200B-\u200D\uFEFF\xAD]/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\u00A0/g, ' ');
  }

  async _resolveImageToBase64(imgUrl) {
    if (!imgUrl) return "";
    
    // If it's already a base64 data URL, return it as is
    if (String(imgUrl).startsWith("data:")) return imgUrl;

    try {
      // Robust ID extraction using regex (matches /wi/image/{id} or /image-id)
      const match = String(imgUrl).match(/\/wi\/image\/(\d+)/) || String(imgUrl).match(/\/(\d+)$/);
      let id = null;
      
      if (match) {
        id = match[1];
      } else {
        // Fallback: try splitting by slash and taking the last part if it looks like a number
        const parts = String(imgUrl).split("/");
        const lastPart = parts[parts.length - 1].split("?")[0].split("#")[0]; // ignore query/hash
        if (/^\d+$/.test(lastPart)) {
          id = lastPart;
        }
      }

      if (!id) {
        console.warn("[PDF Gen] Could not extract image ID from URL:", imgUrl);
        return "";
      }

      const image = await prisma.wi_template_image.findUnique({
        where: { id: parseInt(id) },
      });

      if (image && image.data) {
        let base64Data = "";
        try {
          const buffer = Buffer.isBuffer(image.data) ? image.data : Buffer.from(image.data);
          base64Data = buffer.toString("base64");
          
          const mime = image.mimeType || "image/png";
          const result = `data:${mime};base64,${base64Data}`;
          console.log(`[PDF Gen] Resolved image ${id} (${mime}), size: ${buffer.length}, base64 start: ${result.substring(0, 50)}...`);
          return result;
        } catch (bufErr) {
          console.error(`[PDF Gen] Buffer conversion error for image ${id}:`, bufErr.message);
        }
      } else {
        console.warn(`[PDF Gen] Image ${id} not found in database for URL: ${imgUrl}`);
      }
      return "";
    } catch (err) {
      console.error("[PDF Gen] Error resolving image:", err.message, "URL:", imgUrl);
      return "";
    }
  }

  _formatDate(date) {
    if (!date) return "-";
    const d = new Date(date);
    return d.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}

module.exports = new TemplateGeneratorService();
