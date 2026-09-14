const nodemailer = require("nodemailer");
const magicLinkService = require("./magicLink.service");

/**
 * Email Service using Nodemailer
 * Sends email notifications for document approvals, rejections, and requests
 */

// Create transporter with SMTP config from environment
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

/**
 * Get time-based greeting in Indonesian
 */
const getTimeGreeting = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good Morning";
  if (hour >= 12 && hour < 15) return "Good Afternoon";
  if (hour >= 15 && hour < 18) return "Good Afternoon";
  return "Good Evening";
};

/**
 * Get base email template wrapper - Modern Artience Style
 */
const getEmailTemplate = (content, title) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
      background-color: #f5f5f5;
    }
    .email-wrapper {
      max-width: 1000px;
      margin: 0 auto;
      padding: 20px;
    }
    .email-container {
      background-color: #ffffff;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      overflow: hidden;
      border: 1px solid #e5e7eb;
    }
    .email-header {
      padding: 30px 40px 20px 40px;
    }
    .logo-text {
      font-size: 32px;
      font-weight: 600;
      margin: 0;
      letter-spacing: -1px;
    }
    .logo-art {
      color: #007a5f;
    }
    .logo-ience {
      color: #004d3c;
    }
    .header-line {
      height: 1px;
      background-color: #e5e7eb;
      margin: 0 40px;
    }
    .email-body {
      padding: 30px 40px;
    }
    .greeting {
      color: #047857;
      font-size: 15px;
      margin-bottom: 8px;
    }
    .dear-text {
      color: #333;
      font-size: 15px;
      margin-bottom: 16px;
    }
    .message-text {
      color: #374151;
      font-size: 14px;
      line-height: 1.7;
      margin-bottom: 24px;
    }
    .highlight {
      font-weight: 600;
      color: #111827;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .status-pending { background-color: #fef3c7; color: #92400e; }
    .status-approved { background-color: #d1fae5; color: #065f46; }
    .status-rejected { background-color: #fee2e2; color: #991b1b; }
    .status-revision { background-color: #e0e7ff; color: #3730a3; }
    .document-info {
      background-color: #faf9fbff;
      border-radius: 8px;
      padding: 20px;
      border-radius: 10px;
      margin: 20px 0;
      border: 1px solid #e5e7eb;
    }
    .document-info table {
      width: 100%;
      border-collapse: collapse;
    }
    .document-info td {
      padding: 8px 0;
      vertical-align: top;
      font-size: 14px;
    }
    .document-info .label {
      color: #6b7280;
      width: 140px;
    }
    .document-info .value {
      color: #111827;
      font-weight: 500;
    }
    .button-container {
      text-align: center;
      padding: 20px 0;
    }
    .action-button {
      display: inline-block;
      background-color: #047857;
      color: white !important;
      text-decoration: none;
      padding: 14px 36px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 14px;
      transition: background-color 0.2s;
    }
    .action-button:hover {
      background-color: #065f46;
    }
    .button-dots {
      display: inline-block;
      margin-left: 8px;
      color: #9ca3af;
      font-size: 18px;
      vertical-align: middle;
    }
    .note-text {
      font-size: 12px;
      color: #9ca3af;
      text-align: center;
      margin-top: 8px;
    }
    .email-footer {
      background-color: #f9fafb;
      padding: 24px 40px;
      text-align: center;
      border-top: 1px solid #e5e7eb;
    }
    .footer-text {
      font-size: 11px;
      color: #9ca3af;
      margin: 0;
    }
    .footer-company {
      font-size: 12px;
      color: #6b7280;
      margin: 8px 0 0 0;
      font-weight: 500;
    }
    .comment-box {
      background-color: #fffbeb;
      border-left: 4px solid #f59e0b;
      padding: 16px;
      margin: 20px 0;
      border-radius: 0 8px 8px 0;
    }
    .comment-box .label {
      font-size: 12px;
      color: #92400e;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .comment-box .text {
      font-size: 14px;
      color: #78350f;
    }
    .reference-list {
      background-color: #ecfdf5;
      border-left: 4px solid #10b981;
      padding: 16px;
      margin: 20px 0;
      border-radius: 0 8px 8px 0;
    }
    .divider {
      height: 1px;
      background-color: #e5e7eb;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-container">
      <div class="email-header">
       <img
          class="brand"
        src="https://i.imgur.com/yAgeMxA.png"
          alt="artience brand"
        />
      </div>
      <div class="header-line"></div>
      ${content}
      <div class="email-footer">
        <p class="footer-text">This is an automated message from QADMS (Quality Assurance Document Management System)</p>
        <p class="footer-company">© ${new Date().getFullYear()} PT Toyo Ink Indonesia. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>
`;

/**
 * Send document published announcement email to IT for Level I and Level II documents
 */
async function sendDocumentPublishedEmail({
  documentName,
  documentCode,
  revision,
  appUrl,
  documentId,
}) {
  const transporter = createTransporter();
  const subject = `[DMS] Document Published: ${documentCode || documentName}`;

  // We can just link to the standard detail page since this is for general IT announcement
  // or generate a magic token for IT user if required. However, typical announcement links
  // assume the user can log in to view it. We will just provide a standard link to DMS.
  const targetUrl = `${appUrl}/documents/detail/${documentId}`;

  const content = `
    <div class="email-body">
      <p class="dear-text">Dear <strong>Mr./Mrs.</strong>,</p>
      <p class="greeting">${getTimeGreeting()},</p>
      
      <p class="message-text">
        We would like to announce that document <strong>"${documentName}"</strong> ${documentCode ? `(<strong>"${documentCode}"</strong>)` : ""}<br/>
        Rev. <strong>${revision !== undefined && revision !== null ? revision : "0"}</strong> has been published in DMS.
      </p>
      
      <div class="button-container">
        <a href="${targetUrl}" class="action-button">See Details</a>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM || "QADMS"}" <${process.env.SMTP_USER}>`,
      to: "dms.user@toyoink.co.id",
      cc: [
        "daijiro.kawai@artiencegroup.com",
        "soichiro.kato@artiencegroup.com",
        "takashi.tokura@artiencegroup.com",
        "tomoaki.takahata@artiencegroup.com",
        "yoshinori.niwa@artiencegroup.com",
      ],
      subject: subject,
      html: getEmailTemplate(content, subject),
    });
    console.log(
      `Successfully sent publication email for ${documentCode || documentName} to IT`,
    );
    return true;
  } catch (error) {
    console.error(
      `Failed to send publication email for ${documentCode || documentName}:`,
      error,
    );
    return false;
  }
}

/**
 * Send approval request email with magic link
 */
async function sendApprovalRequestEmail({
  userId,
  toEmail,
  toName,
  documentName,
  documentCode,
  uploaderName,
  documentCategory,
  departmentName,
  revisionNumber,
  level,
  appUrl,
  documentId,
  nextApproverName, // New parameter
}) {
  const transporter = createTransporter();
  const subject = documentCode
    ? `[DMS] Approval Request: ${documentCode} - ${documentName}`
    : `[DMS] Approval Request: ${documentName}`;

  // Generate magic token for auto-login (redirect to approval detail)
  const targetUrl = `/approvals/document/${documentId}`;
  const magicToken = await magicLinkService.generateMagicToken(
    userId,
    targetUrl,
  );
  const magicUrl = `${appUrl}/auth/magic/${magicToken}`;

  const content = `
    <div class="email-body">
      <p class="dear-text">Dear <strong>${toName}</strong> San.</p>
      <p class="greeting">${getTimeGreeting()},</p>
      
      <p class="message-text">
        A document <span class="highlight">${documentCode || documentName}</span> has been submitted and requires your approval at <span class="highlight">Level ${level}</span>.
      </p>
      
      <div class="document-info">
        <table>
          ${
            documentCode
              ? `<tr>
            <td class="label">Document Code</td>
            <td class="value">${documentCode}</td>
          </tr>`
              : ""
          }
          <tr>
            <td class="label">Document Name</td>
            <td class="value">${documentName}</td>
          </tr>
          <tr>
            <td class="label">Category</td>
            <td class="value">${documentCategory || "-"}</td>
          </tr>
          ${
            departmentName
              ? `<tr>
            <td class="label">Department</td>
            <td class="value">${departmentName}</td>
          </tr>`
              : ""
          }
          <tr>
            <td class="label">Submitted By</td>
            <td class="value">${uploaderName}</td>
          </tr>
          <tr>
            <td class="label">Revision</td>
            <td class="value">${String(revisionNumber || 0).padStart(2, "0")}</td>
          </tr>
          <tr>
            <td class="label">Approval Level</td>
            <td class="value">Level ${level}</td>
          </tr>
          ${
            nextApproverName
              ? `<tr>
            <td class="label">Next Approver</td>
            <td class="value">${nextApproverName}</td>
          </tr>`
              : ""
          }
        </table>
      </div>
      
      ${nextApproverName ? `<p class="message-text">After your approval, the document will be forwarded to <strong>${nextApproverName}</strong>.</p>` : ""}
      
      <div class="button-container">
        <a href="${magicUrl}" class="action-button">Approve Request</a>
      </div>
      <p class="note-text">Click the button above to review and take action on this document.</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM || "QADMS"}" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject,
      html: getEmailTemplate(content, subject),
    });
    console.log(`✉️ Approval request email sent to ${toEmail} with magic link`);
    return true;
  } catch (error) {
    console.error(
      `Failed to send approval request email to ${toEmail}:`,
      error,
    );
    return false;
  }
}

/**
 * Send RECORD approval request email with magic link
 */
async function sendRecordApprovalRequestEmail({
  userId,
  toEmail,
  toName,
  recordName,
  recordCode,
  uploaderName,
  recordCategory,
  departmentName,
  level,
  appUrl,
  recordId,
  nextApproverName,
}) {
  const transporter = createTransporter();
  const subject = recordCode
    ? `[DMS Record] Approval Request: ${recordCode} - ${recordName}`
    : `[DMS Record] Approval Request: ${recordName}`;

  // Generate magic token for auto-login (redirect to record detail)
  const targetUrl = `/records/detail/${recordId}`;
  const magicToken = await magicLinkService.generateMagicToken(
    userId,
    targetUrl,
  );
  const magicUrl = `${appUrl}/auth/magic/${magicToken}`;

  const content = `
    <div class="email-body">
      <p class="dear-text">Dear <strong>${toName}</strong> San.</p>
      <p class="greeting">${getTimeGreeting()},</p>
      
      <p class="message-text">
        A record document <span class="highlight">${recordCode || recordName}</span> has been submitted and requires your approval at <span class="highlight">Level ${level}</span>.
      </p>
      
      <div class="document-info">
        <table>
          ${
            recordCode
              ? `<tr>
            <td class="label">Record Code</td>
            <td class="value">${recordCode}</td>
          </tr>`
              : ""
          }
          <tr>
            <td class="label">Record Name</td>
            <td class="value">${recordName}</td>
          </tr>
          <tr>
            <td class="label">Category</td>
            <td class="value">${recordCategory || "-"}</td>
          </tr>
          ${
            departmentName
              ? `<tr>
            <td class="label">Department</td>
            <td class="value">${departmentName}</td>
          </tr>`
              : ""
          }
          <tr>
            <td class="label">Submitted By</td>
            <td class="value">${uploaderName}</td>
          </tr>
          <tr>
            <td class="label">Approval Level</td>
            <td class="value">Level ${level}</td>
          </tr>
          ${
            nextApproverName
              ? `<tr>
            <td class="label">Next Approver</td>
            <td class="value">${nextApproverName}</td>
          </tr>`
              : ""
          }
        </table>
      </div>
      
      ${nextApproverName ? `<p class="message-text">After your approval, the record will be forwarded to <strong>${nextApproverName}</strong>.</p>` : ""}
      
      <div class="button-container">
        <a href="${magicUrl}" class="action-button">Approve Request</a>
      </div>
      <p class="note-text">Click the button above to review and take action on this record document.</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM || "QADMS"}" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject,
      html: getEmailTemplate(content, subject),
    });
    console.log(
      `✉️ Record approval request email sent to ${toEmail} with magic link`,
    );
    return true;
  } catch (error) {
    console.error(
      `Failed to send record approval request email to ${toEmail}:`,
      error,
    );
    return false;
  }
}

/**
 * Send batch approval request email with magic link
 */
async function sendBatchApprovalRequestEmail({
  userId,
  toEmail,
  toName,
  docs,
  uploaderName,
  documentCategory,
  departmentName,
  appUrl,
  batchId, // Receive explicit batchId from parameter
}) {
  const transporter = createTransporter();
  const docCount = docs.length;
  const subject = `[DMS] Batch Approval Request: ${docCount} Documents`;

  // Generate magic token for auto-login (redirect to approvals dashboard)
  const targetUrl = `/approvals?batchId=${batchId}`;
  const magicToken = await magicLinkService.generateMagicToken(
    userId,
    targetUrl,
  );
  const magicUrl = `${appUrl}/auth/magic/${magicToken}`;

  const content = `
    <div class="email-body">
      <p class="dear-text">Dear <strong>${toName}</strong> San.</p>
      <p class="greeting">${getTimeGreeting()},</p>
      
      <p class="message-text">
        There are <span class="highlight">${docCount} migrated documents</span> waiting for your approval.
      </p>
      
      <div class="document-info">
        <table>
          <tr>
            <td class="label">Total Documents</td>
            <td class="value">${docCount}</td>
          </tr>
          <tr>
            <td class="label">Category</td>
            <td class="value">${documentCategory || "-"}</td>
          </tr>
          ${
            departmentName
              ? `<tr>
            <td class="label">Department</td>
            <td class="value">${departmentName}</td>
          </tr>`
              : ""
          }
          <tr>
            <td class="label">Submitted By</td>
            <td class="value">${uploaderName || "-"}</td>
          </tr>
        </table>
      </div>
      
      <p class="message-text">Please review and approve these documents.</p>
      
      <div class="button-container">
        <a href="${magicUrl}" class="action-button">Go to Approvals Dashboard</a>
      </div>
      <p class="note-text">Click the button above to view all your pending requests.</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM || "QADMS"}" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject,
      html: getEmailTemplate(content, subject),
    });
    console.log(`✉️ Batch approval email sent to ${toEmail}`);
    return true;
  } catch (error) {
    console.error(`Failed to send batch approval email to ${toEmail}:`, error);
    return false;
  }
}

/**
 * Send document approved email
 */
async function sendDocumentApprovedEmail({
  userId,
  toEmail,
  toName,
  documentName,
  documentCode,
  approverName,
  level,
  isFullyApproved,
  appUrl,
  documentId,
}) {
  const transporter = createTransporter();
  const docIdentifier = documentCode || documentName;
  const subject = isFullyApproved
    ? `[DMS] ✅ Document Fully Approved: ${docIdentifier}`
    : `[DMS] ✅ Level ${level} Approved: ${docIdentifier}`;

  // Generate magic token for auto-login (redirect to document detail)
  const targetUrl = `/documents/detail/${documentId}`;
  const magicToken = await magicLinkService.generateMagicToken(
    userId,
    targetUrl,
  );
  const magicUrl = `${appUrl}/auth/magic/${magicToken}`;

  const content = `
    <div class="email-body">
      <p class="dear-text">Dear <strong>${toName}</strong> San.</p>
      <p class="greeting">${getTimeGreeting()},</p>
      
      <p class="message-text">
        Great news! Your document <span class="highlight">${documentCode || documentName}</span> has been <span class="highlight">${isFullyApproved ? "FULLY APPROVED" : `approved at Level ${level}`}</span>.
      </p>
      
      <div class="document-info">
        <table>
          ${
            documentCode
              ? `<tr>
            <td class="label">Document Code</td>
            <td class="value">${documentCode}</td>
          </tr>`
              : ""
          }
          <tr>
            <td class="label">Document Name</td>
            <td class="value">${documentName}</td>
          </tr>
          <tr>
            <td class="label">Approved By</td>
            <td class="value">${approverName}</td>
          </tr>
          <tr>
            <td class="label">Status</td>
            <td class="value">${isFullyApproved ? "✅ Fully Approved" : `Level ${level} Approved`}</td>
          </tr>
        </table>
      </div>
      
      <p class="message-text">
        ${
          isFullyApproved
            ? "Your document is now active and available for distribution."
            : "The document will proceed to the next approval level."
        }
      </p>
      
      <div class="button-container">
        <a href="${magicUrl}" class="action-button">See Details</a>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM || "QADMS"}" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject,
      html: getEmailTemplate(content, subject),
    });
    console.log(`✉️ Approval notification email sent to ${toEmail}`);
    return true;
  } catch (error) {
    console.error(`Failed to send approval email to ${toEmail}:`, error);
    return false;
  }
}

/**
 * Send batch document approved email (consolidated)
 */
async function sendBatchDocumentApprovedEmail({
  userId,
  toEmail,
  toName,
  docs, // Array of { documentCode, documentName, documentId }
  approverName,
  appUrl,
}) {
  const transporter = createTransporter();
  const docCount = docs.length;
  const subject = `[DMS] ✅ ${docCount} Documents Fully Approved`;

  // Generate magic token for auto-login (redirect to documents dashboard)
  const targetUrl = `/documents`;
  const magicToken = await magicLinkService.generateMagicToken(
    userId,
    targetUrl,
  );
  const magicUrl = `${appUrl}/auth/magic/${magicToken}`;

  const content = `
    <div class="email-body">
      <p class="dear-text">Dear <strong>${toName}</strong> San.</p>
      <p class="greeting">${getTimeGreeting()},</p>
      
      <p class="message-text">
        Great news! The following <span class="highlight">${docCount} documents</span> have been <span class="highlight">FULLY APPROVED</span> and are now active.
      </p>
      
      <div class="document-info">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 2px solid #e5e7eb;">
              <th style="text-align: left; padding: 10px; font-size: 13px; color: #6b7280;">Code</th>
              <th style="text-align: left; padding: 10px; font-size: 13px; color: #6b7280;">Name</th>
            </tr>
          </thead>
          <tbody>
            ${docs
              .map(
                (doc) => `
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 10px; font-size: 13px; font-weight: 500;">${doc.documentCode || "-"}</td>
                <td style="padding: 10px; font-size: 13px;">${doc.documentName}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
      
      <p class="message-text">
        These documents are now available for distribution in the system.
      </p>
      
      <div class="button-container">
        <a href="${magicUrl}" class="action-button">View My Documents</a>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM || "QADMS"}" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject,
      html: getEmailTemplate(content, subject),
    });
    console.log(`✉️ Batch approval notification email sent to ${toEmail}`);
    return true;
  } catch (error) {
    console.error(`Failed to send batch approval email to ${toEmail}:`, error);
    return false;
  }
}

/**
 * Send document rejected email
 */
async function sendDocumentRejectedEmail({
  userId,
  toEmail,
  toName,
  documentName,
  documentCode,
  approverName,
  reason,
  appUrl,
  documentId,
}) {
  const transporter = createTransporter();
  const docIdentifier = documentCode || documentName;
  const subject = `[DMS] ❌ Document Rejected: ${docIdentifier}`;

  // Generate magic token for auto-login (redirect to document detail)
  const targetUrl = `/documents/detail/${documentId}`;
  const magicToken = await magicLinkService.generateMagicToken(
    userId,
    targetUrl,
  );
  const magicUrl = `${appUrl}/auth/magic/${magicToken}`;

  const content = `
    <div class="email-body">
      <p class="dear-text">Dear <strong>${toName}</strong> San.</p>
      <p class="greeting">${getTimeGreeting()},</p>
      
      <p class="message-text">
        Unfortunately, your document <span class="highlight">${documentCode || documentName}</span> has been <span class="highlight" style="color: #dc2626;">REJECTED</span> and requires revision.
      </p>
      
      <div class="document-info">
        <table>
          ${
            documentCode
              ? `<tr>
            <td class="label">Document Code</td>
            <td class="value">${documentCode}</td>
          </tr>`
              : ""
          }
          <tr>
            <td class="label">Document Name</td>
            <td class="value">${documentName}</td>
          </tr>
          <tr>
            <td class="label">Rejected By</td>
            <td class="value">${approverName}</td>
          </tr>
        </table>
      </div>
      
      ${
        reason
          ? `
      <div class="comment-box">
        <div class="label">Rejection Reason:</div>
        <div class="text">${reason}</div>
      </div>
      `
          : ""
      }
      
      <p class="message-text">Please revise your document and resubmit for approval.</p>
      
      <div class="button-container">
        <a href="${magicUrl}" class="action-button">See Details</a>
        <span class="button-dots">•••</span>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM || "QADMS"}" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject,
      html: getEmailTemplate(content, subject),
    });
    console.log(`✉️ Rejection notification email sent to ${toEmail}`);
    return true;
  } catch (error) {
    console.error(`Failed to send rejection email to ${toEmail}:`, error);
    return false;
  }
}

/**
 * Send reference check request email with magic link
 */

async function sendReferenceCheckEmail({
  userId, // For magic link
  toEmail,
  toName,
  documentName,
  documentCode,
  referenceName,
  uploaderName,
  appUrl,
  documentId,
  referenceLinkId, // Reference link ID for direct navigation
}) {
  try {
    const transporter = createTransporter();
    const docIdentifier = documentCode || documentName;
    const subject = `[DMS] Reference Check Required: ${docIdentifier}`;

    // Generate magic token for auto-login (redirect to reference approval detail)
    const targetUrl = referenceLinkId
      ? `/approvals/reference/${referenceLinkId}`
      : `/approvals`;
    const magicToken = await magicLinkService.generateMagicToken(
      userId,
      targetUrl,
    );
    const magicUrl = `${appUrl}/auth/magic/${magicToken}`;

    const content = `
    <div class="email-body">
      <p class="dear-text">Dear <strong>${toName}</strong> San.</p>
      <p class="greeting">${getTimeGreeting()},</p>
      
      <p class="message-text">
        A document <span class="highlight">${documentCode || documentName}</span> requires your <span class="highlight">reference check verification</span> for ${referenceName}.
      </p>
      
      <div class="document-info">
        <table>
          ${
            documentCode
              ? `<tr>
            <td class="label">Document Code</td>
            <td class="value">${documentCode}</td>
          </tr>`
              : ""
          }
          <tr>
            <td class="label">Document Name</td>
            <td class="value">${documentName}</td>
          </tr>
          <tr>
            <td class="label">Submitted By</td>
            <td class="value">${uploaderName}</td>
          </tr>
          <tr>
            <td class="label">Reference</td>
            <td class="value">${referenceName}</td>
          </tr>
        </table>
      </div>
      
      <p class="message-text">Please verify that the document properly references the standard/procedure indicated above.</p>
      
      <div class="button-container">
        <a href="${magicUrl}" class="action-button">Approve Reference Check</a>
      </div>
      <p class="note-text">Click the button above to review and verify the reference.</p>
    </div>
  `;

    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM || "QADMS"}" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject,
      html: getEmailTemplate(content, subject),
    });
    console.log(`✉️ Reference check email sent to ${toEmail}`);
    return true;
  } catch (error) {
    console.error(
      `Failed to send reference check email to ${toEmail} (User: ${userId}):`,
      error,
    );
    return false;
  }
}

/**
 * Send revision request email with magic link
 */
async function sendRevisionRequestEmail({
  userId,
  toEmail,
  toName,
  documentName,
  documentCode,
  uploaderName,
  revisionNumber,
  appUrl,
  documentId,
  nextApproverName, // New parameter
}) {
  const transporter = createTransporter();
  const revisionStr = String(revisionNumber).padStart(2, "0");
  const docIdentifier = documentCode || documentName;
  const subject = documentCode
    ? `[DMS] Revision Approval Request: ${documentCode} Rev.${revisionStr}`
    : `[DMS] Revision Approval Request: ${documentName} Rev.${revisionStr}`;

  // Generate magic token for auto-login (redirect to revision approval detail)
  const targetUrl = `/approvals/revision/${documentId}`;
  const magicToken = await magicLinkService.generateMagicToken(
    userId,
    targetUrl,
  );
  const magicUrl = `${appUrl}/auth/magic/${magicToken}`;

  const content = `
    <div class="email-body">
      <p class="dear-text">Dear <strong>${toName}</strong> San.</p>
      <p class="greeting">${getTimeGreeting()},</p>
      
      <p class="message-text">
        A document revision <span class="highlight">${documentCode || documentName} Rev.${revisionStr}</span> has been submitted and requires your approval.
      </p>
      
      <div class="document-info">
        <table>
          ${
            documentCode
              ? `<tr>
            <td class="label">Document Code</td>
            <td class="value">${documentCode}</td>
          </tr>`
              : ""
          }
          <tr>
            <td class="label">Document Name</td>
            <td class="value">${documentName}</td>
          </tr>
          <tr>
            <td class="label">Revised By</td>
            <td class="value">${uploaderName}</td>
          </tr>
          <tr>
            <td class="label">Revision</td>
            <td class="value">Rev.${revisionStr}</td>
          </tr>
          ${
            nextApproverName
              ? `<tr>
            <td class="label">Next Approver</td>
            <td class="value">${nextApproverName}</td>
          </tr>`
              : ""
          }
        </table>
      </div>
      
      ${nextApproverName ? `<p class="message-text">After your approval, the documents will be forwarded to <strong>${nextApproverName}</strong>.</p>` : ""}
      <p class="message-text">Please review the revised document and take action at your earliest convenience.</p>
      
      <div class="button-container">
        <a href="${magicUrl}" class="action-button">Approve Revision Request</a>
      </div>
      <p class="note-text">Click the button above to review and approve/reject the revision.</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM || "QADMS"}" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject,
      html: getEmailTemplate(content, subject),
    });
    console.log(`✉️ Revision request email sent to ${toEmail} with magic link`);
    return true;
  } catch (error) {
    console.error(`Failed to send revision email to ${toEmail}:`, error);
    return false;
  }
}

/**
 * Send print approval request email with magic link
 */
async function sendPrintApprovalEmail({
  userId,
  toEmail,
  toName,
  documentName,
  documentCode,
  requesterName,
  copies,
  appUrl,
  printRequestId,
}) {
  const transporter = createTransporter();
  const docIdentifier = documentCode || documentName;
  const subject = `[DMS] Print Approval Request: ${docIdentifier}`;

  // Generate magic token for auto-login (redirect to print approval detail)
  const targetUrl = `/approvals/print/${printRequestId}`;
  const magicToken = await magicLinkService.generateMagicToken(
    userId,
    targetUrl,
  );
  const magicUrl = `${appUrl}/auth/magic/${magicToken}`;

  const content = `
    <div class="email-body">
      <p class="dear-text">Dear <strong>${toName}</strong> San.</p>
      <p class="greeting">${getTimeGreeting()},</p>
      
      <p class="message-text">
        A print request for document <span class="highlight">${documentCode || documentName}</span> has been submitted and requires your approval.
      </p>
      
      <div class="document-info">
        <table>
          ${
            documentCode
              ? `<tr>
            <td class="label">Document Code</td>
            <td class="value">${documentCode}</td>
          </tr>`
              : ""
          }
          <tr>
            <td class="label">Document Name</td>
            <td class="value">${documentName}</td>
          </tr>
          <tr>
            <td class="label">Requested By</td>
            <td class="value">${requesterName}</td>
          </tr>
          <tr>
            <td class="label">Copies</td>
            <td class="value">${copies}</td>
          </tr>
        </table>
      </div>
      
      <p class="message-text">Please review and approve or reject this print request.</p>
      
      <div class="button-container">
        <a href="${magicUrl}" class="action-button">Approve Print Request</a>
      </div>
      <p class="note-text">Click the button above to review the print request.</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM || "QADMS"}" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject,
      html: getEmailTemplate(content, subject),
    });
    console.log(`✉️ Print approval email sent to ${toEmail} with magic link`);
    return true;
  } catch (error) {
    console.error(`Failed to send print approval email to ${toEmail}:`, error);
    return false;
  }
}

/**
 * Send deletion approval request email with magic link
 */
async function sendDeletionApprovalEmail({
  userId,
  toEmail,
  toName,
  documentName,
  documentCode,
  requesterName,
  reason,
  appUrl,
  approvalId,
}) {
  const transporter = createTransporter();
  const docIdentifier = documentCode || documentName;
  const subject = `[DMS] Deletion Approval Request: ${docIdentifier}`;

  // Generate magic token for auto-login (redirect to deletion approval detail)
  const targetUrl = `/approvals/deletion/${approvalId}`;
  const magicToken = await magicLinkService.generateMagicToken(
    userId,
    targetUrl,
  );
  const magicUrl = `${appUrl}/auth/magic/${magicToken}`;

  const content = `
    <div class="email-body">
      <p class="dear-text">Dear <strong>${toName}</strong> San.</p>
      <p class="greeting">${getTimeGreeting()},</p>
      
      <p class="message-text">
        A deletion request for document <span class="highlight">${documentCode || documentName}</span> has been submitted and requires your approval.
      </p>
      
      <div class="document-info">
        <table>
          ${
            documentCode
              ? `<tr>
            <td class="label">Document Code</td>
            <td class="value">${documentCode}</td>
          </tr>`
              : ""
          }
          <tr>
            <td class="label">Document Name</td>
            <td class="value">${documentName}</td>
          </tr>
          <tr>
            <td class="label">Requested By</td>
            <td class="value">${requesterName}</td>
          </tr>
        </table>
      </div>
      
      ${
        reason
          ? `
      <div class="comment-box">
        <div class="label">Deletion Reason:</div>
        <div class="text">${reason}</div>
      </div>
      `
          : ""
      }
      
      <p class="message-text">Please review and approve or reject this deletion request.</p>
      
      <div class="button-container">
        <a href="${magicUrl}" class="action-button">Approve Delete Documnets</a>
      </div>
      <p class="note-text">Click the button above to review the deletion request.</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM || "QADMS"}" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject,
      html: getEmailTemplate(content, subject),
    });
    console.log(
      `✉️ Deletion approval email sent to ${toEmail} with magic link`,
    );
    return true;
  } catch (error) {
    console.error(
      `Failed to send deletion approval email to ${toEmail}:`,
      error,
    );
    return false;
  }
}

/**
 * Send print request approved notification email
 */
async function sendPrintRequestApprovedEmail({
  toEmail,
  toName,
  documentName,
  documentCode,
  approverName,
  appUrl,
  documentId,
}) {
  const transporter = createTransporter();
  const docIdentifier = documentCode || documentName;
  const subject = `[DMS] ✅ Print Request Approved: ${docIdentifier}`;

  const content = `
    <div class="email-body">
      <p class="dear-text">Dear <strong>${toName}</strong> San.</p>
      <p class="greeting">${getTimeGreeting()},</p>
      
      <p class="message-text">
        Permintaan cetak dokumen <span class="highlight">${documentCode || documentName}</span> telah <span class="highlight">DISETUJUI</span> oleh ${approverName}.
      </p>
      
      <div class="document-info">
        <table>
          ${
            documentCode
              ? `<tr>
            <td class="label">Document Code</td>
            <td class="value">${documentCode}</td>
          </tr>`
              : ""
          }
          <tr>
            <td class="label">Document Name</td>
            <td class="value">${documentName}</td>
          </tr>
          <tr>
            <td class="label">Approved By</td>
            <td class="value">${approverName}</td>
          </tr>
          <tr>
            <td class="label">Status</td>
            <td class="value">✅ Approved (Ready for Pickup)</td>
          </tr>
        </table>
      </div>
      
      <p class="message-text">
        Silakan segera ambil dokumen fisik tersebut di departemen <span class="highlight">Quality Assurance (QA)</span>.
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM || "QADMS"}" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject,
      html: getEmailTemplate(content, subject),
    });
    console.log(`✉️ Print approval notification email sent to ${toEmail}`);
    return true;
  } catch (error) {
    console.error(
      `Failed to send print approval notification email to ${toEmail}:`,
      error,
    );
    return false;
  }
}

/**
 * Send print request READY notification email
 */
async function sendPrintRequestReadyEmail({
  toEmail,
  toName,
  documentName,
  documentCode,
  appUrl,
  documentId,
}) {
  const transporter = createTransporter();
  const docIdentifier = documentCode || documentName;
  const subject = `[DMS] 📦 Document Ready for Pickup: ${docIdentifier}`;

  const content = `
    <div class="email-body">
      <p class="dear-text">Dear <strong>${toName}</strong> San.</p>
      <p class="greeting">${getTimeGreeting()},</p>
      
      <p class="message-text">
        Kabar baik! Dokumen <span class="highlight">${documentCode || documentName}</span> sudah selesai dicetak.
      </p>
      
      <div class="document-info">
        <table>
          ${
            documentCode
              ? `<tr>
            <td class="label">Document Code</td>
            <td class="value">${documentCode}</td>
          </tr>`
              : ""
          }
          <tr>
            <td class="label">Document Name</td>
            <td class="value">${documentName}</td>
          </tr>
          <tr>
            <td class="label">Status</td>
            <td class="value">📦 Ready for Pickup</td>
          </tr>
        </table>
      </div>
      <p class="message-text">
        Silakan ambil dokumen fisik tersebut di departemen <span class="highlight">Quality Assurance (QA)</span> sekarang.
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM || "QADMS"}" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject,
      html: getEmailTemplate(content, subject),
    });
    console.log(`✉️ Print ready notification email sent to ${toEmail}`);
    return true;
  } catch (error) {
    console.error(
      `Failed to send print ready notification email to ${toEmail}:`,
      error,
    );
    return false;
  }
}

/**
 * Send consolidated "Fully Approved" notification email to requester
 */
async function sendBatchDocumentApprovedEmail({
  userId,
  toEmail,
  toName,
  docs, // Array of { documentId, documentName, documentCode }
  approverName,
  appUrl,
}) {
  const transporter = createTransporter();
  const subject = `[DMS] ✅ ${docs.length} Documents Fully Approved`;

  // Generate magic token for auto-login (redirect to master documents dashboard)
  const targetUrl = `/documents`;
  const magicToken = await magicLinkService.generateMagicToken(
    userId,
    targetUrl,
  );
  const magicUrl = `${appUrl}/auth/magic/${magicToken}`;

  const docRows = docs
    .map(
      (doc) => `
    <tr>
      <td style="padding: 8px; border: 1px solid #ddd;">${doc.documentCode || "-"}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${doc.documentName}</td>
      <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">✅ Approved</td>
    </tr>
  `,
    )
    .join("");

  const content = `
    <div class="email-body">
      <p class="dear-text">Dear <strong>${toName}</strong> San.</p>
      <p class="greeting">${getTimeGreeting()},</p>
      
      <p class="message-text">
        Great news! The following <span class="highlight">${docs.length} documents</span> have been <span class="highlight">FULLY APPROVED</span> by ${approverName} and are now published.
      </p>
      
      <div class="document-info">
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
          <thead>
            <tr style="background-color: #f8f9fa;">
              <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Code</th>
              <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Name</th>
              <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${docRows}
          </tbody>
        </table>
      </div>
      
      <p class="message-text" style="margin-top: 20px;">
        You can now view these documents in the <strong>Master Documents</strong> section of the DMS.
      </p>
      
      <div class="button-container">
        <a href="${magicUrl}" class="action-button">View Master Documents</a>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM || "QADMS"}" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject,
      html: getEmailTemplate(content, subject),
    });
    console.log(
      `✉️ Batch approval notification email sent to ${toEmail} for ${docs.length} docs`,
    );
    return true;
  } catch (error) {
    console.error(
      `Failed to send batch approval notification email to ${toEmail}:`,
      error,
    );
    return false;
  }
}

/**
 * Send deletion fully approved email to the requester
 */
async function sendDeletionFullyApprovedEmail({
  userId,
  toEmail,
  toName,
  documentName,
  documentCode,
  approverName,
  appUrl,
  documentId,
}) {
  const transporter = createTransporter();
  const docIdentifier = documentCode || documentName;
  const subject = `[DMS] ✅ Deletion Fully Approved: ${docIdentifier}`;

  const targetUrl = `/documents`;
  const magicToken = await magicLinkService.generateMagicToken(
    userId,
    targetUrl,
  );
  const magicUrl = `${appUrl}/auth/magic/${magicToken}`;

  const content = `
    <div class="email-body">
      <p class="dear-text">Dear <strong>${toName}</strong> San.</p>
      <p class="greeting">${getTimeGreeting()},</p>
      
      <p class="message-text">
        Permintaan penghapusan dokumen <span class="highlight">${documentCode || documentName}</span> telah <span class="highlight">DISETUJUI SEPENUHNYA</span>.
      </p>
      
      <div class="document-info">
        <table>
          ${
            documentCode
              ? `<tr>
            <td class="label">Document Code</td>
            <td class="value">${documentCode}</td>
          </tr>`
              : ""
          }
          <tr>
            <td class="label">Document Name</td>
            <td class="value">${documentName}</td>
          </tr>
          <tr>
            <td class="label">Status</td>
            <td class="value">✅ Obsolete (Deleted)</td>
          </tr>
        </table>
      </div>
      
      <p class="message-text">
        Dokumen tersebut sekarang berstatus OBSOLETE dan tidak lagi didistribusikan.
      </p>
      
      <div class="button-container">
        <a href="${magicUrl}" class="action-button">Lihat Master Dokumen</a>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM || "QADMS"}" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject,
      html: getEmailTemplate(content, subject),
    });
    console.log(`✉️ Deletion fully approved email sent to ${toEmail}`);
    return true;
  } catch (error) {
    console.error(
      `Failed to send deletion fully approved email to ${toEmail}:`,
      error,
    );
    return false;
  }
}

/**
 * Send approval reminder email
 */
async function sendApprovalReminderEmail({
  userId,
  toEmail,
  toName,
  documentName,
  documentCode,
  uploaderName,
  level,
  appUrl,
  documentId,
  daysPending,
}) {
  const transporter = createTransporter();
  const subject = documentCode
    ? `[DMS Reminder] Urgent Approval Needed: ${documentCode} - ${documentName}`
    : `[DMS Reminder] Urgent Approval Needed: ${documentName}`;

  // Generate magic token for auto-login (redirect to approval detail)
  const targetUrl = `/approvals/document/${documentId}`;
  const magicToken = await magicLinkService.generateMagicToken(
    userId,
    targetUrl,
  );
  const magicUrl = `${appUrl}/auth/magic/${magicToken}`;

  const content = `
    <div class="email-body">
      <p class="dear-text">Dear <strong>${toName}</strong> San.</p>
      <p class="greeting">${getTimeGreeting()},</p>
      
      <p class="message-text">
        This is a <span class="highlight" style="color: #dc2626;">REMINDER</span> that a document <span class="highlight">${documentCode || documentName}</span> has been pending your approval for <strong>${daysPending} days</strong> at <span class="highlight">Level ${level}</span>.
      </p>
      
      <div class="document-info">
        <table>
          ${
            documentCode
              ? `<tr>
            <td class="label">Document Code</td>
            <td class="value">${documentCode}</td>
          </tr>`
              : ""
          }
          <tr>
            <td class="label">Document Name</td>
            <td class="value">${documentName}</td>
          </tr>
          <tr>
            <td class="label">Submitted By</td>
            <td class="value">${uploaderName}</td>
          </tr>
          <tr>
            <td class="label">Approval Level</td>
            <td class="value">Level ${level}</td>
          </tr>
          <tr>
            <td class="label">Pending For</td>
            <td class="value">${daysPending} Days</td>
          </tr>
        </table>
      </div>
      
      <p class="message-text">Please review and take action immediately to avoid further delays.</p>
      
      <div class="button-container">
        <a href="${magicUrl}" class="action-button">Approve Request</a>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM || "QADMS"}" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject,
      html: getEmailTemplate(content, subject),
    });
    console.log(`✉️ Approval reminder email sent to ${toEmail}`);
    return true;
  } catch (error) {
    console.error(
      `Failed to send approval reminder email to ${toEmail}:`,
      error,
    );
    return false;
  }
}

module.exports = {
  sendApprovalRequestEmail,
  sendBatchApprovalRequestEmail,
  sendDocumentApprovedEmail,
  sendBatchDocumentApprovedEmail,
  sendDocumentRejectedEmail,
  sendReferenceCheckEmail,
  sendRevisionRequestEmail,
  sendPrintApprovalEmail,
  sendDeletionApprovalEmail,
  sendPrintRequestApprovedEmail,
  sendPrintRequestReadyEmail,
  sendRecordApprovalRequestEmail,
  sendDeletionFullyApprovedEmail,
  sendApprovalReminderEmail,
  sendDocumentPublishedEmail,
};
