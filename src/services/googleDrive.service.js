const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

class GoogleDriveService {
  constructor() {
    this.drive = null;
    this.initialized = false;
  }

  /**
   * Initialize Google Drive API with service account credentials
   */
  async initialize() {
    if (this.initialized) return;

    try {
      const credentialsPath = process.env.GOOGLE_DRIVE_CREDENTIALS_PATH;

      if (!credentialsPath) {
        console.warn(
          "Google Drive credentials not configured. File upload will be disabled."
        );
        return;
      }

      const auth = new google.auth.GoogleAuth({
        keyFile: credentialsPath,
        scopes: ["https://www.googleapis.com/auth/drive.file"],
      });

      this.drive = google.drive({ version: "v3", auth });
      this.initialized = true;
      console.log("Google Drive service initialized successfully");
    } catch (error) {
      console.error(
        "Failed to initialize Google Drive service:",
        error.message
      );
      throw error;
    }
  }

  /**
   * Upload file to Google Drive
   * @param {Buffer} fileBuffer - File buffer
   * @param {string} fileName - File name
   * @param {string} mimeType - MIME type
   * @returns {Promise<string>} - Google Drive file ID
   */
  async uploadFile(fileBuffer, fileName, mimeType = "application/pdf") {
    await this.initialize();

    if (!this.drive) {
      throw new Error("Google Drive service not initialized");
    }

    try {
      const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

      const fileMetadata = {
        name: fileName,
        parents: folderId ? [folderId] : [],
      };

      const { Readable, PassThrough } = require("stream");

      // Create a proper stream from buffer
      const bufferStream = new PassThrough();
      bufferStream.end(fileBuffer);

      const media = {
        mimeType,
        body: bufferStream,
      };

      const response = await this.drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: "id, webViewLink, webContentLink",
        supportsAllDrives: true, // Support for Shared Drives
        supportsTeamDrives: true, // Legacy support
      });

      // Make file readable by anyone with the link (optional)
      await this.drive.permissions.create({
        fileId: response.data.id,
        requestBody: {
          role: "reader",
          type: "anyone",
        },
        supportsAllDrives: true,
        supportsTeamDrives: true,
      });

      return response.data.id;
    } catch (error) {
      console.error("Error uploading file to Google Drive:", error.message);
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }

  /**
   * Download file from Google Drive
   * @param {string} fileId - Google Drive file ID
   * @returns {Promise<Buffer>} - File buffer
   */
  async downloadFile(fileId) {
    await this.initialize();

    if (!this.drive) {
      throw new Error("Google Drive service not initialized");
    }

    try {
      const response = await this.drive.files.get(
        {
          fileId: fileId,
          alt: "media",
          supportsAllDrives: true,
          supportsTeamDrives: true,
        },
        { responseType: "arraybuffer" }
      );

      return Buffer.from(response.data);
    } catch (error) {
      console.error("Error downloading file from Google Drive:", error.message);
      throw new Error(`Failed to download file: ${error.message}`);
    }
  }

  /**
   * Delete file from Google Drive
   * @param {string} fileId - Google Drive file ID
   * @returns {Promise<void>}
   */
  async deleteFile(fileId) {
    await this.initialize();

    if (!this.drive) {
      throw new Error("Google Drive service not initialized");
    }

    try {
      await this.drive.files.delete({
        fileId: fileId,
        supportsAllDrives: true,
        supportsTeamDrives: true,
      });
    } catch (error) {
      console.error("Error deleting file from Google Drive:", error.message);
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * Get file metadata
   * @param {string} fileId - Google Drive file ID
   * @returns {Promise<Object>} - File metadata
   */
  async getFileMetadata(fileId) {
    await this.initialize();

    if (!this.drive) {
      throw new Error("Google Drive service not initialized");
    }

    try {
      const response = await this.drive.files.get({
        fileId: fileId,
        fields:
          "id, name, mimeType, size, webViewLink, webContentLink, createdTime, modifiedTime",
        supportsAllDrives: true,
        supportsTeamDrives: true,
      });

      return response.data;
    } catch (error) {
      console.error("Error getting file metadata:", error.message);
      throw new Error(`Failed to get file metadata: ${error.message}`);
    }
  }

  /**
   * Rename file in Google Drive
   * @param {string} fileId - Google Drive file ID
   * @param {string} newName - New file name
   * @returns {Promise<void>}
   */
  async renameFile(fileId, newName) {
    await this.initialize();

    if (!this.drive) {
      throw new Error("Google Drive service not initialized");
    }

    try {
      await this.drive.files.update({
        fileId: fileId,
        requestBody: {
          name: newName,
        },
        supportsAllDrives: true,
        supportsTeamDrives: true,
      });
      console.log(`File ${fileId} renamed to: ${newName}`);
    } catch (error) {
      console.error("Error renaming file in Google Drive:", error.message);
      throw new Error(`Failed to rename file: ${error.message}`);
    }
  }
}

// Export singleton instance
module.exports = new GoogleDriveService();
