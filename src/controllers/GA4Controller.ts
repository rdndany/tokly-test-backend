import { Request, Response } from "express";
import { HTTPSTATUS } from "../config/http.config";
import { ga4Service } from "../services/ga4Service";

const STUB_DATA = {
  devices: [] as { device: string; views: number; percentage: number }[],
  countries: [] as { country: string; views: number }[],
  referrers: [] as { referrer: string; views: number }[],
  browsers: [] as { browser: string; views: number }[],
  avgSessionDuration: 0,
  bounceRate: 0,
  newVsReturning: { newUsers: 0, returningUsers: 0 },
  totalUsers: 0,
  totalScreenPageViews: 0,
  dailySessionStats: [] as { date: string; avgSessionDuration: number; bounceRate: number }[],
  dailyTotals: [] as { date: string; activeUsers: number; screenPageViews: number }[],
};

export async function getGA4Analytics(req: Request, res: Response): Promise<void> {
  try {
    const projectId = req.params.projectId;
    if (!projectId) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ success: false, message: "Project ID is required" });
      return;
    }
    if (!req.auth?.userId) {
      res.status(HTTPSTATUS.UNAUTHORIZED).json({ message: "Unauthorized" });
      return;
    }

    if (!ga4Service.isReady()) {
      res.status(HTTPSTATUS.OK).json({
        success: true,
        ga4Enabled: false,
        data: {
          message: "GA4 not configured. Set GA4_CREDENTIALS and GA4_PROPERTY_ID in backend .env.",
          ...STUB_DATA,
        },
      });
      return;
    }

    const startDate = (req.query.startDate as string) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const endDate = (req.query.endDate as string) || new Date().toISOString().split("T")[0];

    const analytics = await ga4Service.getProjectAnalytics(projectId, startDate, endDate);

    if (!analytics) {
      res.status(HTTPSTATUS.OK).json({
        success: true,
        ga4Enabled: true,
        data: { message: "Could not load analytics for this period.", ...STUB_DATA },
      });
      return;
    }

    res.status(HTTPSTATUS.OK).json({
      success: true,
      ga4Enabled: true,
      data: analytics,
    });
  } catch {
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({ message: "Failed to get GA4 analytics" });
  }
}

export async function getGA4Status(req: Request, res: Response): Promise<void> {
  try {
    if (!req.auth?.userId) {
      res.status(HTTPSTATUS.UNAUTHORIZED).json({ message: "Unauthorized" });
      return;
    }
    const configured = ga4Service.isReady();
    res.status(HTTPSTATUS.OK).json({
      success: true,
      ga4Enabled: configured,
      data: {
        configured,
        message: configured ? "GA4 is configured and ready" : "GA4 is not configured",
      },
    });
  } catch {
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({ message: "Failed to get GA4 status" });
  }
}
