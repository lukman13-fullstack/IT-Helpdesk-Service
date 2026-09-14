const path = require("path");
const prisma = require("../../utils/prisma");
const googleDriveService = require("../../services/googleDrive.service");
const pdfGeneratorService = require("../../services/pdfGenerator.service");
const pdfWatermarkService = require("../../services/pdfWatermark.service");
const {
  generateDocumentCode,
  isValidCategory,
  getDocumentLevel,
} = require("../../utils/documentCode.util");
const {
  notifyApprovers,
  notifyReferenceCheckers,
} = require("../../utils/notification.util");
const templateGeneratorService = require("../../services/templateGenerator.service");
const { logCreate } = require("../../utils/logger");
const { canBypassApproval } = require("../../utils/authorization.util");

async function createDocumentHandler(req, res) {
  try {
    console.log("Create Document Request:");
    console.log("Files Keys:", req.files ? Object.keys(req.files) : "No files");
    if (req.files) {
      console.log(
        "File 'file':",
        req.files["file"]
          ? `Present (Type: ${typeof req.files[
              "file"
            ]}, IsArray: ${Array.isArray(req.files["file"])})`
          : "Missing/Undefined"
      );
      console.log("File 'file' Value:", req.files["file"]);
      console.log(
        "File 'masterDocumentFile':",
        req.files["masterDocumentFile"] ? "Present" : "Missing"
      );
    }
    console.log("Body:", req.body);

    const {
      name,
      category,
      isInternal,
      proposalObjective,
      documentFormat,
      retentionPeriod,
      hardDocumentRetentionPeriod,
      storageLocation,
      hardDocumentStorageLocation,
      publishingInstitution,
      dateOfIssue,
      expiredDate,
      documentStoragePeriod,
      remark,
      referenceIds,
      destination,
      templateData,
    } = req.body;
    const uploadedBy = req.user.id;

    // Parse referenceIds if it's a string (from FormData)
    let parsedReferenceIds = [];
    if (referenceIds) {
      try {
        parsedReferenceIds =
          typeof referenceIds === "string"
            ? JSON.parse(referenceIds)
            : referenceIds;
        if (!Array.isArray(parsedReferenceIds)) {
          parsedReferenceIds = [parsedReferenceIds];
        }
        parsedReferenceIds = parsedReferenceIds
          .map((id) => parseInt(id))
          .filter((id) => !isNaN(id));
      } catch (e) {
        console.log("Failed to parse referenceIds:", e);
        parsedReferenceIds = [];
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: uploadedBy },
      include: {
        departments: {
          where: { isDeleted: false },
          include: {
            department: true,
          },
        },
      },
    });

    if (!user || user.departments.length === 0) {
      return res.status(400).json({
        success: false,
        message: "User tidak memiliki department yang terdaftar",
      });
    }

    let departmentId = user.departments[0].departmentId;
    const userDepartments = user.departments.map(ud => ud.department.departmentCode);
    const isQaUser = userDepartments.includes("QA");

    // If QA user selects a destination (QA or MR), we use that department
    let finalDepartmentId = departmentId;
    if (destination) {
      if (isQaUser && (destination === "QA" || destination === "MR")) {
        const targetDept = await prisma.department.findFirst({
          where: {
            departmentCode: destination,
            isDeleted: false
          }
        });
        if (targetDept) {
          finalDepartmentId = targetDept.id;
          console.log(`QA user selected destination ${destination}. Switching departmentId from ${departmentId} to ${finalDepartmentId}`);
        }
      } else if (!isQaUser) {
        // For non-QA users with multiple departments, destination is the department name
        const targetDept = await prisma.department.findFirst({
          where: {
            name: destination,
            isDeleted: false
          }
        });
        if (targetDept) {
          finalDepartmentId = targetDept.id;
          console.log(`User selected destination ${destination}. Switching departmentId from ${departmentId} to ${finalDepartmentId}`);
        }
      }
    }

    // Category is required only for Internal documents
    const isInternalBool = isInternal === "true" || isInternal === true;
    if (isInternalBool && !category) {
      return res.status(400).json({
        success: false,
        message: "Category is required for Internal documents",
      });
    }

    if (!isInternal) {
      return res.status(400).json({
        success: false,
        message: "Document must be internal or external",
      });
    }
    if (!proposalObjective) {
      return res.status(400).json({
        success: false,
        message: "Proposal objective is required",
      });
    }

    // Validate mandatory references for manual categories
    if (isInternalBool && category === "manual_perusahaan") {
      if (parsedReferenceIds.length < 2) {
        return res.status(400).json({
          success: false,
          message: "Manual Perusahaan documents require at least 2 document references",
        });
      }
    }
    if (isInternalBool && category === "manual_halal") {
      if (parsedReferenceIds.length < 1) {
        return res.status(400).json({
          success: false,
          message: "Manual Halal documents require at least 1 document reference",
        });
      }
    }

    // Category validation - only for Internal documents
    if (isInternalBool && category && !isValidCategory(category)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid category. Must be one of: form, standard, instruksi_kerja, procedure_mutu, manual",
      });
    }

    // Files are mandatory for Internal, optional for External,
    // EXCEPT for system-generated category "instruksi_kerja" which uses templateData
    const isSystemGenerated = isInternalBool && category === "instruksi_kerja" && templateData;
    let parsedTemplateData = null;

    if (isSystemGenerated) {
      try {
        parsedTemplateData = typeof templateData === "string" ? JSON.parse(templateData) : templateData;
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: "Invalid templateData JSON provided for Instruksi Kerja",
        });
      }
    }

    if (isInternalBool && !isSystemGenerated) {
      if (!req.files || !req.files["file"]) {
        return res.status(400).json({
          success: false,
          message: "PDF file is required for Internal documents (unless system generated)",
        });
      }

      if (!req.files || !req.files["masterDocumentFile"]) {
        return res.status(400).json({
          success: false,
          message: "Master document file is required for Internal documents (unless system generated)",
        });
      }
    }

    // Validate conditional fields for Form documents only
    if (isInternalBool && category === "form") {
      if (!documentFormat) {
        return res.status(400).json({
          success: false,
          message: "Document format is required for Internal documents",
        });
      }
      if (!retentionPeriod) {
        return res.status(400).json({
          success: false,
          message: "Retention period is required for Internal documents",
        });
      }
      // For digital_and_hard_document format, require both retention periods
      if (
        documentFormat === "digital_and_hard_document" &&
        !hardDocumentRetentionPeriod
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Hard document retention period is required for Digital & Hard format",
        });
      }
      if (!storageLocation) {
        return res.status(400).json({
          success: false,
          message: "Storage location is required for Internal documents",
        });
      }
      // For digital_and_hard_document format, require both storage locations
      if (
        documentFormat === "digital_and_hard_document" &&
        !hardDocumentStorageLocation
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Hard document storage location is required for Digital & Hard format",
        });
      }
    }

    // Validate conditional fields for External documents (isInternalBool already defined above)
    if (!isInternalBool) {
      if (!documentFormat) {
        return res.status(400).json({
          success: false,
          message: "Document format is required for External documents",
        });
      }
      if (!publishingInstitution) {
        return res.status(400).json({
          success: false,
          message: "Publishing institution is required for External documents",
        });
      }
      if (!dateOfIssue) {
        return res.status(400).json({
          success: false,
          message: "Date of issue is required for External documents",
        });
      }
      if (!storageLocation) {
        return res.status(400).json({
          success: false,
          message: "Document storage (location) is required for External documents",
        });
      }
    }

    const department = await prisma.department.findUnique({
      where: { id: parseInt(finalDepartmentId) },
      include: {
        hierarchies: {
          where: { isDeleted: false },
          orderBy: { level: "asc" },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
        // Also fetch category-specific hierarchies
        categoryHierarchies: {
          where: { isDeleted: false },
          orderBy: { level: "asc" },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
      },
    });

    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found",
      });
    }

    // Check if user has BYPASS_ALL_APPROVAL permission
    const hasBypassPermission = canBypassApproval(req.user);

    // ============================================
    // AUTO-INJECT QA AS LEVEL 1 "CHECKED BY"
    // All documents from any department must be checked by QA first
    // ============================================
    const qaDepartments = await prisma.department.findMany({
      where: {
        departmentCode: "QA", // Strict match for QA department
        isDeleted: false,
      },
      include: {
        users: {
          where: { isDeleted: false },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                username: true, // Added for admin exclusion
                isDeleted: true,
                role: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Get all active QA users (not deleted) AND with SUPER_ADMIN role
    // Filter out generic admin accounts to ensure only designated workflow users are picked
    const qaUsers = [];
    qaDepartments.forEach((qaDept) => {
      qaDept.users.forEach((ud) => {
        const username = ud.user.username?.toLowerCase() || "";
        const fullName = ud.user.fullName?.toLowerCase() || "";
        
        if (
          !ud.user.isDeleted &&
          ud.user.role?.name === "SUPER_ADMIN" && // Only Super Admin
          username !== "admin" && // Skip generic admin account
          fullName !== "admin" && // Skip generic admin name
          !qaUsers.find((u) => u.id === ud.user.id)
        ) {
          qaUsers.push(ud.user);
        }
      });
    });

    if (!hasBypassPermission && qaUsers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No QA department users with 'SUPER_ADMIN' role found for document checking. Please configure valid QA users.",
      });
    }

    console.log(`Found ${qaUsers.length} QA (SUPER_ADMIN) users for Level 1 checking:`, qaUsers.map(u => u.fullName));

    // Determine which hierarchy to use based on document category
    // For external documents, use provided category if available, otherwise default to "external"
    // This allows external documents to follow 'form', 'prosedur', etc. hierarchies if configured.
    const documentCategory = isInternalBool ? category : (category || "external");
    const categoryHierarchies = department.categoryHierarchies.filter(
      (ch) => ch.category === documentCategory
    );
    
    // Transform category hierarchies with level +1 offset (QA is Level 1, hierarchy starts at Level 2)
    const effectiveHierarchies = categoryHierarchies.map((ch) => ({
      id: ch.id,
      userId: ch.userId,
      level: ch.level + 1, // Shift levels: hierarchy Level 1 becomes Level 2, etc.
      user: ch.user,
      isCategorySpecific: true,
    }));

    // QA users as Level 1 (auto-injected, no hierarchy/categoryHierarchy ID)
    const qaLevel1Hierarchies = qaUsers.map((qaUser) => ({
      id: null, // No hierarchy ID for auto-injected QA
      userId: qaUser.id,
      level: 1,
      user: qaUser,
      isCategorySpecific: false,
      isQaAutoInjected: true,
    }));

    // Combine: QA Level 1 + shifted category hierarchies
    const allHierarchies = [...qaLevel1Hierarchies, ...effectiveHierarchies];

    console.log(`Approval hierarchy: QA Level 1 (${qaUsers.length} users) + ${effectiveHierarchies.length} category hierarchy levels`);
    console.log(`Effective hierarchies:`, allHierarchies.map(h => ({ level: h.level, user: h.user?.fullName, isQA: h.isQaAutoInjected || false })));


    // Generate document code only for Internal documents
    // External documents get a simple unique identifier (no category-based code)
    let documentCode;
    let documentNumber;
    if (isInternalBool) {
      const generated = await generateDocumentCode(
        parseInt(finalDepartmentId),
        category,
        true
      );
      documentCode = generated.documentCode;
      documentNumber = generated.documentNumber;
    } else {
      // For External documents: no visible document code (empty)
      // Use a simple internal ID for file naming only (not shown to user)
      const now = new Date();
      const dateStr = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      documentCode = ""; // Empty - no visible document code for external
      documentNumber = 0;
      // Internal file ID for Google Drive naming
      var externalFileId = `EXT-${dateStr}-${random}`;
    }

    // Prepare file naming prefix
    const fileNamePrefix = isInternalBool ? documentCode : externalFileId;

    // PARALLEL UPLOAD OPTIMIZATION
    let googleDriveFileId = null;
    let fileSize = null;
    let mimeType = null;
    let masterDocumentGoogleDriveId = null;
    let masterDocumentFileSize = null;
    let masterDocumentMimeType = null;
    let masterDocumentPath = null;
    let systemGeneratedPdfBuffer = null;
    
    // Prepare upload promises
    const uploadPromises = [];
    
    if (req.files && req.files["file"]) {
      const pdfFile = req.files["file"][0];
      const fileName = `${fileNamePrefix}_v1.0.pdf`;
      fileSize = pdfFile.size;
      mimeType = pdfFile.mimetype;
      
      uploadPromises.push(
        googleDriveService.uploadFile(pdfFile.buffer, fileName, pdfFile.mimetype)
          .then(id => { googleDriveFileId = id; })
      );
    }
    
    if (req.files && req.files["masterDocumentFile"]) {
      const masterFile = req.files["masterDocumentFile"][0];
      const masterFileName = `${fileNamePrefix}_master_v1.0${path.extname(masterFile.originalname)}`;
      masterDocumentFileSize = masterFile.size;
      masterDocumentMimeType = masterFile.mimetype;
      masterDocumentPath = masterFile.originalname;
      
      uploadPromises.push(
        googleDriveService.uploadFile(masterFile.buffer, masterFileName, masterFile.mimetype)
          .then(id => { masterDocumentGoogleDriveId = id; })
      );
    }

    if (isSystemGenerated && parsedTemplateData) {
      // Generate DOCX and PDF buffers dynamically
      const generated = await templateGeneratorService.generateFiles(
        { 
          documentCode: fileNamePrefix, 
          name: name,
          releaseDate: dateOfIssue ? new Date(dateOfIssue) : new Date()
        },
        parsedTemplateData
      );
      systemGeneratedPdfBuffer = generated.pdfBuffer;

      // Set file data
      fileSize = generated.pdfBuffer.length;
      mimeType = "application/pdf";
      const fileName = `${fileNamePrefix}_v1.0.pdf`;

      uploadPromises.push(
        googleDriveService.uploadFile(generated.pdfBuffer, fileName, mimeType)
          .then(id => { googleDriveFileId = id; })
      );

      // Excel master is optional — only upload if generated successfully
      if (generated.excelBuffer) {
        masterDocumentFileSize = generated.excelBuffer.length;
        masterDocumentMimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        masterDocumentPath = `${fileNamePrefix}_master_v1.0.xlsx`;
        const masterFileName = masterDocumentPath;

        uploadPromises.push(
          googleDriveService.uploadFile(generated.excelBuffer, masterFileName, masterDocumentMimeType)
            .then(id => { masterDocumentGoogleDriveId = id; })
        );
      }

      // Save templateData to the document later using Prisma
    }
    
    // Wait for all uploads to complete
    if (uploadPromises.length > 0) {
      await Promise.all(uploadPromises);
    }

    // Auto-approve document if user has bypass permission
    const documentStatus = hasBypassPermission ? "approved" : "draft";
    const releaseDate = hasBypassPermission ? new Date() : null;

    const document = await prisma.document.create({
      data: {
        name,
        documentCode,
        documentNumber,
        isInternal: isInternalBool,
        proposalObjective,
        category: isInternalBool ? category : (category || "external"), // Use provided category if available, otherwise 'external'
        googleDriveFileId,
        fileSize,
        mimeType,
        masterDocumentGoogleDriveId,
        masterDocumentFileSize,
        masterDocumentMimeType,
        masterDocumentPath,
        departmentId: parseInt(finalDepartmentId),
        uploadedBy,
        status: documentStatus,
        isPublished: hasBypassPermission,
        releaseDate: releaseDate,
        documentFormat: documentFormat || null,
        retentionPeriod: retentionPeriod || null,
        hardDocumentRetentionPeriod: hardDocumentRetentionPeriod || null,
        storageLocation: storageLocation || null,
        hardDocumentStorageLocation: hardDocumentStorageLocation || null,
        publishingInstitution: publishingInstitution || null,
        dateOfIssue: dateOfIssue ? new Date(dateOfIssue) : null,
        expiredDate: expiredDate ? new Date(expiredDate) : null,
        documentStoragePeriod: documentStoragePeriod
          ? parseInt(documentStoragePeriod)
          : null,
        remark: remark || null,
        destination: destination || null,
      },
      include: {
        department: {
          select: {
            id: true,
            name: true,
            departmentCode: true,
          },
        },
        uploader: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (isSystemGenerated && parsedTemplateData) {
      // Save normalized template data to work_instruction_template table
      await prisma.work_instruction_template.create({
        data: {
          documentId: document.id,
          version: 1,
          revision: 0,
          templateData: {
            topSections: parsedTemplateData.topSections || [],
            instructionText: parsedTemplateData.instructionText || "",
            sections: parsedTemplateData.sections || [],
            attachments: parsedTemplateData.attachments || [],
            pages: parsedTemplateData.pages || null,
          },
          styleData: parsedTemplateData.style || null,
          sectionCount: (parsedTemplateData.sections || []).length,
          attachmentCount: (parsedTemplateData.attachments || []).length,
        }
      });
    }

    // Create document reference links if referenceIds provided
    let linkedReferences = [];
    if (parsedReferenceIds.length > 0) {
      // Validate that all references exist and are active
      const validReferences = await prisma.document_reference.findMany({
        where: {
          id: { in: parsedReferenceIds },
          isActive: true,
        },
        include: {
          checker: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
      });

      if (validReferences.length > 0) {
        // Create reference links with pending status
        // Reference checkers will be notified AFTER Level 1 approves
        await prisma.document_reference_link.createMany({
          data: validReferences.map((ref) => ({
            documentId: document.id,
            referenceId: ref.id,
            status: hasBypassPermission ? "approved" : "pending",
            checkedAt: hasBypassPermission ? new Date() : null,
            checkedBy: hasBypassPermission ? ref.checkerId : null,
          })),
        });

        linkedReferences = validReferences;

        // NOTE: Reference checker notifications are NOT sent here.
        // They will be notified after Level 1 approves (progressive flow).
        console.log(
          "Reference links created. Ref checkers will be notified after Level 1 approves."
        );
      }
    }

    // Create approval records for all cases (both bypass and normal)
    // Determine document level based on category
    const documentLevel = getDocumentLevel(category);

    // Filter hierarchies based on document level
    // Level III restriction removed: always use full configured hierarchy
    let targetHierarchies = effectiveHierarchies;
    /* 
    if (documentLevel === "III") {
      targetHierarchies = effectiveHierarchies.filter((h) => h.level === 1);
    } 
    */

    // PROGRESSIVE APPROVAL: Always create Level 1 (QA) only at document creation
    // Flow: Level 1 (QA checked by) → References → Level 2 → Level 3 ...
    let approvalRecords = [];

    if (hasBypassPermission) {
      // Bypass: create all approvals as approved (QA + hierarchy levels)
      approvalRecords = allHierarchies.map((hierarchy) => ({
        documentId: document.id,
        hierarchyId: null, // Not using old hierarchy
        categoryHierarchyId: hierarchy.isCategorySpecific ? hierarchy.id : null,
        approverId: hierarchy.userId,
        level: hierarchy.level,
        status: "approved",
        type: "approval", // New Doc
        documentRevision: 0, // New Doc = revision 00
        approvedAt: new Date(),
        approvedBy: hierarchy.userId,
        createdBy: req.user.id,
      }));
    } else {
      // Normal: Create Level 1 (QA) approvals ONLY
      // QA users are always Level 1 "checked by"
      // Next levels and references will be created progressively after QA approves
      const level1Hierarchies = allHierarchies.filter((h) => h.level === 1);
      approvalRecords = level1Hierarchies.map((hierarchy) => ({
        documentId: document.id,
        hierarchyId: null,
        categoryHierarchyId: hierarchy.isCategorySpecific ? hierarchy.id : null,
        approverId: hierarchy.userId,
        level: hierarchy.level,
        status: "pending",
        type: "approval", // New Doc
        documentRevision: 0, // New Doc = revision 00
        createdBy: req.user.id,
      }));
      console.log(
        `Created ${approvalRecords.length} Level 1 (QA checked by) approvals for New Doc (Rev.00). Next steps will be created after QA approves.`
      );
    }

    if (approvalRecords.length > 0) {
      await prisma.digital_approval.createMany({
        data: approvalRecords,
      });
    }

    // Notify level 1 approvers only if NOT bypass (bypass is already approved)
    if (!hasBypassPermission) {
      // Get the created approval records with their IDs
      const createdApprovals = await prisma.digital_approval.findMany({
        where: {
          documentId: document.id,
          level: 1,
          type: "approval",
          documentRevision: 0,
        },
        select: {
          id: true,
          approverId: true,
        },
      });

      if (createdApprovals.length > 0) {
        // Send notification to each approver with their specific approval ID
        for (const approval of createdApprovals) {
          await notifyApprovers(
            document.id,
            document.name,
            document.category,
            document.revision,
            [approval.approverId],
            {
              documentCode: document.documentCode || "",
              departmentName: document.department?.name || "",
              uploaderName: document.uploader?.fullName || req.user.fullName || "",
              documentCategory: document.category || "",
              revisionNumber: document.revision || '00',
              level: 1,
              approvalId: approval.id, // Pass approval ID for magic link
            }
          );
        }
      }
    } else {
      // User has bypass permission
      const pdfFileBufferToUse = req.files?.["file"] ? req.files["file"][0].buffer : systemGeneratedPdfBuffer;

      if (pdfFileBufferToUse) {
        console.log("Bypass approval: Triggering background final document generation...");
        
        // BACKGROUND PROCESSING (Fire & Forget)
        // We use the buffer we already have, no need to download
        const pdfFileBuffer = pdfFileBufferToUse;
        
        try {
          console.log("BYPASS: Generating final documents synchronously:", document.id);

          // Fetch actual approval records for cover page
          const approvalsForCover = await prisma.digital_approval.findMany({
            where: {
              documentId: document.id,
              type: { in: ["approval", "revision"] },
              status: "approved",
              documentRevision: 0,
            },
            orderBy: { level: "asc" },
            include: {
              approver: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                  position: true,
                  role: { select: { name: true } },
                },
              },
            },
          });

          // Fetch full document data
          const docWithRefs = await prisma.document.findUnique({
            where: { id: document.id },
            include: {
              department: true,
              uploader: true,
              references: {
                include: { checker: true, reference: true },
              },
            },
          });

          // Generate cover page
          const coverPageBuffer = await pdfGeneratorService.generateCoverPage(
            { ...docWithRefs, releaseDate: new Date() },
            approvalsForCover
          );

          // Merge with ORIGINAL BUFFER (Optimization: No download needed)
          const finalPdfBuffer = await pdfGeneratorService.mergePDFs(
            coverPageBuffer,
            pdfFileBuffer
          );

          // Upload final approved version
          const finalFileName = `${fileNamePrefix}_v1.0_APPROVED.pdf`;
          const finalFileId = await googleDriveService.uploadFile(
            finalPdfBuffer,
            finalFileName,
            "application/pdf"
          );

          // Generate & Upload Watermarks sequentially or parallel
          const masterBuf = await pdfWatermarkService.addMasterWatermark(finalPdfBuffer).catch(e => { console.error("Watermark master failed", e); return finalPdfBuffer; });
          const masterFileId = await googleDriveService.uploadFile(masterBuf, `${fileNamePrefix}_v1.0_MASTER.pdf`, "application/pdf");

          const controlledBuf = await pdfWatermarkService.addControlledWatermark(finalPdfBuffer).catch(e => { console.error("Watermark ctrl failed", e); return finalPdfBuffer; });
          const controlledFileId = await googleDriveService.uploadFile(controlledBuf, `${fileNamePrefix}_v1.0_CONTROLLED.pdf`, "application/pdf");

          const uncontrolledBuf = await pdfWatermarkService.addUncontrolledWatermark(finalPdfBuffer).catch(e => { console.error("Watermark unctrl failed", e); return finalPdfBuffer; });
          const uncontrolledFileId = await googleDriveService.uploadFile(uncontrolledBuf, `${fileNamePrefix}_v1.0_UNCONTROLLED.pdf`, "application/pdf");

          // Update document
          await prisma.document.update({
            where: { id: document.id },
            data: {
              googleDriveFileId: finalFileId, // Update main file ID so cover page shows up
              googleDriveFinalFileId: finalFileId,
              googleDriveMasterVersionId: masterFileId,
              googleDriveControlledVersionId: controlledFileId,
              googleDriveUncontrolledVersionId: uncontrolledFileId,
            },
          });

          document.googleDriveFileId = finalFileId; // Reflect in response

          console.log("BYPASS: Final documents generated successfully for bypassed document ID", document.id);
        } catch (err) {
          console.error("BYPASS ERROR: Failed to generate final documents for bypassed document:", err);
          // Don't fail the whole request, but log error
        }
      } else {
        console.log("Bypass approval: Skipping PDF generation (No file provided)");
      }
    }

    // Log document creation
    await logCreate(
      "document",
      req.user.id,
      req.user.fullName,
      document.id,
      {
        email: req.user.email || "",
        documentCode: document.documentCode,
        documentName: document.name,
        departmentName: document.department.name,
        category: document.category,
      },
      null,
      document.departmentId
    );

    // Fetch the final document state to ensure all background updates are included
    const finalDocument = await prisma.document.findUnique({
      where: { id: document.id },
      include: {
        department: {
          select: {
            id: true,
            name: true,
            departmentCode: true,
          },
        },
        uploader: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    return res.status(201).json({
      success: true,
      message: hasBypassPermission
        ? "Document created and approved automatically"
        : "Document created successfully",
      data: finalDocument,
    });
  } catch (error) {
    console.error("Error creating document:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create document",
    });
  }
}

module.exports = createDocumentHandler;
