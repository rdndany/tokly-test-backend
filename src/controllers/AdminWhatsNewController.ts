import { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { HTTPSTATUS } from "../config/http.config";
import { createLogger } from "../utils/logger";
import * as WhatsNewService from "../services/whatsNewService";

const logger = createLogger("AdminWhatsNewController");

function getAdminId(req: Request): string | null {
  return req.auth?.userId ?? getAuth(req)?.userId ?? null;
}

export async function listAdminWhatsNew(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const entries = await WhatsNewService.listAllForAdmin();
    res.status(HTTPSTATUS.OK).json({ entries });
  } catch (error) {
    logger.error("listAdminWhatsNew error:", error);
    res
      .status(HTTPSTATUS.INTERNAL_SERVER_ERROR)
      .json({ message: "Failed to list What's New" });
  }
}

export async function createAdminWhatsNew(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const adminUserId = getAdminId(req);
    if (!adminUserId) {
      res.status(HTTPSTATUS.UNAUTHORIZED).json({ message: "Unauthorized" });
      return;
    }
    const body = req.body as WhatsNewService.CreateWhatsNewPayload;
    const entry = await WhatsNewService.createEntry(adminUserId, body);
    res.status(HTTPSTATUS.CREATED).json(entry);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create entry";
    const status =
      message.includes("required") || message.includes("too long")
        ? HTTPSTATUS.BAD_REQUEST
        : HTTPSTATUS.INTERNAL_SERVER_ERROR;
    if (status === HTTPSTATUS.INTERNAL_SERVER_ERROR) {
      logger.error("createAdminWhatsNew error:", error);
    }
    res.status(status).json({ message });
  }
}

export async function updateAdminWhatsNew(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "id is required" });
      return;
    }
    const body = req.body as WhatsNewService.UpdateWhatsNewPayload;
    const entry = await WhatsNewService.updateEntry(id, body);
    if (!entry) {
      res.status(HTTPSTATUS.NOT_FOUND).json({ message: "Entry not found" });
      return;
    }
    res.status(HTTPSTATUS.OK).json(entry);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update entry";
    const status =
      message.includes("required") || message.includes("too long")
        ? HTTPSTATUS.BAD_REQUEST
        : HTTPSTATUS.INTERNAL_SERVER_ERROR;
    if (status === HTTPSTATUS.INTERNAL_SERVER_ERROR) {
      logger.error("updateAdminWhatsNew error:", error);
    }
    res.status(status).json({ message });
  }
}

export async function deleteAdminWhatsNew(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "id is required" });
      return;
    }
    const deleted = await WhatsNewService.deleteEntry(id);
    if (!deleted) {
      res.status(HTTPSTATUS.NOT_FOUND).json({ message: "Entry not found" });
      return;
    }
    res.status(HTTPSTATUS.OK).json({ success: true });
  } catch (error) {
    logger.error("deleteAdminWhatsNew error:", error);
    res
      .status(HTTPSTATUS.INTERNAL_SERVER_ERROR)
      .json({ message: "Failed to delete entry" });
  }
}

export async function regenerateAdminWhatsNewSummary(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "id is required" });
      return;
    }
    const entry = await WhatsNewService.regenerateSummaryForEntry(id);
    if (!entry) {
      res.status(HTTPSTATUS.NOT_FOUND).json({ message: "Entry not found" });
      return;
    }
    res.status(HTTPSTATUS.OK).json(entry);
  } catch (error) {
    logger.error("regenerateAdminWhatsNewSummary error:", error);
    res
      .status(HTTPSTATUS.INTERNAL_SERVER_ERROR)
      .json({ message: "Failed to regenerate summary" });
  }
}
