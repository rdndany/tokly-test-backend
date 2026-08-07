import { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { HTTPSTATUS } from "../config/http.config";
import { createLogger } from "../utils/logger";
import * as WhatsNewService from "../services/whatsNewService";

const logger = createLogger("WhatsNewController");

function getUserId(req: Request): string | null {
  return req.auth?.userId ?? getAuth(req)?.userId ?? null;
}

export async function listPublishedWhatsNew(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const entries = await WhatsNewService.listPublishedForUser();
    res.status(HTTPSTATUS.OK).json({ entries });
  } catch (error) {
    logger.error("listPublishedWhatsNew error:", error);
    res
      .status(HTTPSTATUS.INTERNAL_SERVER_ERROR)
      .json({ message: "Failed to list What's New" });
  }
}

export async function getPublishedWhatsNew(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "id is required" });
      return;
    }
    const entry = await WhatsNewService.getPublishedById(id);
    if (!entry) {
      res.status(HTTPSTATUS.NOT_FOUND).json({ message: "Entry not found" });
      return;
    }
    res.status(HTTPSTATUS.OK).json(entry);
  } catch (error) {
    logger.error("getPublishedWhatsNew error:", error);
    res
      .status(HTTPSTATUS.INTERNAL_SERVER_ERROR)
      .json({ message: "Failed to load entry" });
  }
}

export async function getWhatsNewUnreadCount(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(HTTPSTATUS.UNAUTHORIZED).json({ message: "Unauthorized" });
      return;
    }
    const count = await WhatsNewService.getUnreadCount(userId);
    res.status(HTTPSTATUS.OK).json({ count });
  } catch (error) {
    logger.error("getWhatsNewUnreadCount error:", error);
    res
      .status(HTTPSTATUS.INTERNAL_SERVER_ERROR)
      .json({ message: "Failed to get unread count" });
  }
}

export async function markWhatsNewSeen(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(HTTPSTATUS.UNAUTHORIZED).json({ message: "Unauthorized" });
      return;
    }
    await WhatsNewService.markSeen(userId);
    res.status(HTTPSTATUS.OK).json({ ok: true });
  } catch (error) {
    logger.error("markWhatsNewSeen error:", error);
    res
      .status(HTTPSTATUS.INTERNAL_SERVER_ERROR)
      .json({ message: "Failed to mark as seen" });
  }
}
