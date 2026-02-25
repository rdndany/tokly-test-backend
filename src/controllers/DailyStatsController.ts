import { Request, Response } from "express";
import * as dailyStatsService from "../services/dailyStatsService";
import { HTTPSTATUS } from "../config/http.config";

export async function incrementView(req: Request, res: Response): Promise<void> {
  try {
    const { projectId, visitorId } = req.body as { projectId?: string; visitorId?: string };
    if (!projectId || !visitorId) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({
        success: false,
        message: "projectId and visitorId are required",
      });
      return;
    }
    await dailyStatsService.incrementView(projectId, visitorId);
    res.status(HTTPSTATUS.OK).json({ success: true, data: { message: "View counted" } });
  } catch {
    res.status(HTTPSTATUS.OK).json({ success: true, data: { message: "View counted" } });
  }
}

export async function getTodayStats(req: Request, res: Response): Promise<void> {
  try {
    const projectId = req.params.projectId;
    if (!projectId) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ success: false, message: "Project ID is required" });
      return;
    }
    const userId = req.auth?.userId;
    if (!userId) {
      res.status(HTTPSTATUS.UNAUTHORIZED).json({ message: "Unauthorized" });
      return;
    }
    const stats = await dailyStatsService.getTodayStats(projectId);
    res.status(HTTPSTATUS.OK).json({ success: true, data: stats });
  } catch {
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({ message: "Failed to get today stats" });
  }
}

export async function getStatsRange(req: Request, res: Response): Promise<void> {
  try {
    const projectId = req.params.projectId;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    if (!projectId || !startDate || !endDate) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({
        success: false,
        message: "projectId, startDate, and endDate are required",
      });
      return;
    }
    if (!req.auth?.userId) {
      res.status(HTTPSTATUS.UNAUTHORIZED).json({ message: "Unauthorized" });
      return;
    }
    const data = await dailyStatsService.getStatsRange(projectId, startDate, endDate);
    res.status(HTTPSTATUS.OK).json({ success: true, data });
  } catch {
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({ message: "Failed to get stats range" });
  }
}

export async function getTotalStats(req: Request, res: Response): Promise<void> {
  try {
    const projectId = req.params.projectId;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    if (!projectId) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ success: false, message: "Project ID is required" });
      return;
    }
    if (!req.auth?.userId) {
      res.status(HTTPSTATUS.UNAUTHORIZED).json({ message: "Unauthorized" });
      return;
    }
    const data = await dailyStatsService.getTotalStats(projectId, startDate, endDate);
    res.status(HTTPSTATUS.OK).json({ success: true, data });
  } catch {
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({ message: "Failed to get total stats" });
  }
}
