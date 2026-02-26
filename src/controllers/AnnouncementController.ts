import { Request, Response } from "express";
import { HTTPSTATUS } from "../config/http.config";
import { getActiveAnnouncement } from "../services/announcementService";
import { createLogger } from "../utils/logger";

const logger = createLogger("AnnouncementController");

/** Public: get the current active announcement (no auth). */
export async function getActive(req: Request, res: Response): Promise<void> {
  try {
    const announcement = await getActiveAnnouncement();
    res.status(HTTPSTATUS.OK).json(announcement);
  } catch (error) {
    logger.error("Error fetching active announcement", error);
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
      message: "Failed to fetch announcement",
    });
  }
}
