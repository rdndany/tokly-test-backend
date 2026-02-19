import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import { s3Client, S3_CONFIG } from "../config/aws";

export interface UploadResponse {
  uploadUrl: string;
  fileKey: string;
  publicUrl: string;
}

export interface PresignedUrlRequest {
  fileName: string;
  fileType: string;
  fileSize: number;
  folderPath?: string;
}

export class UploadService {
  /** Upload a buffer directly to S3 (server-side). Returns public URL. */
  static async uploadBuffer(
    fileKey: string,
    buffer: Buffer,
    contentType: string
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: S3_CONFIG.BUCKET_NAME,
      Key: fileKey,
      Body: buffer,
      ContentType: contentType,
    });
    await s3Client.send(command);
    return `https://${S3_CONFIG.BUCKET_NAME}.s3.${S3_CONFIG.REGION}.amazonaws.com/${fileKey}`;
  }

  static async generatePresignedUrl(
    request: PresignedUrlRequest
  ): Promise<UploadResponse> {
    const { fileName, fileType, fileSize, folderPath } = request;

    if (!S3_CONFIG.ALLOWED_FILE_TYPES.includes(fileType)) {
      throw new Error(`File type ${fileType} is not allowed`);
    }

    if (fileSize > S3_CONFIG.MAX_FILE_SIZE) {
      throw new Error(
        `File size exceeds maximum allowed size of ${S3_CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB`
      );
    }

    const fileExtension = fileName.split(".").pop();
    const baseFolder = folderPath
      ? `${S3_CONFIG.UPLOAD_FOLDER}${folderPath}/`
      : S3_CONFIG.UPLOAD_FOLDER;
    const fileKey = `${baseFolder}${uuidv4()}.${fileExtension}`;

    const command = new PutObjectCommand({
      Bucket: S3_CONFIG.BUCKET_NAME,
      Key: fileKey,
      ContentType: fileType,
      ContentLength: fileSize,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 15 * 60,
    });

    const publicUrl = `https://${S3_CONFIG.BUCKET_NAME}.s3.${S3_CONFIG.REGION}.amazonaws.com/${fileKey}`;

    return { uploadUrl, fileKey, publicUrl };
  }

  static validateFile(file: {
    name: string;
    type: string;
    size: number;
  }): { isValid: boolean; error?: string } {
    if (!S3_CONFIG.ALLOWED_FILE_TYPES.includes(file.type)) {
      return {
        isValid: false,
        error: `File type ${file.type} is not allowed. Allowed types: ${S3_CONFIG.ALLOWED_FILE_TYPES.join(", ")}`,
      };
    }

    if (file.size > S3_CONFIG.MAX_FILE_SIZE) {
      return {
        isValid: false,
        error: `File size exceeds maximum allowed size of ${S3_CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB`,
      };
    }

    if (!file.name?.trim()) {
      return { isValid: false, error: "File name is required" };
    }

    return { isValid: true };
  }

  static async deleteFileByUrl(fileUrl: string): Promise<void> {
    const fileKey = this.extractFileKeyFromUrl(fileUrl);
    if (!fileKey) throw new Error("Invalid S3 URL format");

    const command = new DeleteObjectCommand({
      Bucket: S3_CONFIG.BUCKET_NAME,
      Key: fileKey,
    });
    await s3Client.send(command);
  }

  private static extractFileKeyFromUrl(fileUrl: string): string | null {
    try {
      const url = new URL(fileUrl);
      const pathname = url.pathname.startsWith("/")
        ? url.pathname.slice(1)
        : url.pathname;
      if (
        url.hostname.includes(".s3.") &&
        url.hostname.includes(".amazonaws.com")
      ) {
        return pathname;
      }
      return null;
    } catch {
      return null;
    }
  }
}
