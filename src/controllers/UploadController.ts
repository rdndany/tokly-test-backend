import { Request, Response } from "express";
import { UploadService, PresignedUrlRequest } from "../services/uploadService";

export async function generatePresignedUrl(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { fileName, fileType, fileSize, folderPath } =
      req.body as PresignedUrlRequest;

    if (!fileName || !fileType || !fileSize) {
      res.status(400).json({
        success: false,
        error: "fileName, fileType, and fileSize are required",
      });
      return;
    }

    const validation = UploadService.validateFile({
      name: fileName,
      type: fileType,
      size: fileSize,
    });

    if (!validation.isValid) {
      res.status(400).json({
        success: false,
        error: validation.error,
      });
      return;
    }

    const uploadData = await UploadService.generatePresignedUrl({
      fileName,
      fileType,
      fileSize,
      folderPath,
    });

    res.json({ success: true, data: uploadData });
  } catch (error) {
    res.status(500).json({
      success: false,
      error:
        error instanceof Error ? error.message : "Internal server error",
    });
  }
}

export async function deleteFile(req: Request, res: Response): Promise<void> {
  try {
    const { fileUrl } = req.body as { fileUrl?: string };

    if (!fileUrl) {
      res.status(400).json({
        success: false,
        error: "fileUrl is required",
      });
      return;
    }

    await UploadService.deleteFileByUrl(fileUrl);

    res.json({ success: true, message: "File deleted successfully" });
  } catch (error) {
    res.status(500).json({
      success: false,
      error:
        error instanceof Error ? error.message : "Internal server error",
    });
  }
}
