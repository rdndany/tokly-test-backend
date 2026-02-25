import { Request, Response } from "express";
import { HTTPSTATUS } from "../config/http.config";

const GA4_STUB_DATA = {
  devices: [] as { device: string; views: number; percentage: number }[],
  countries: [] as { country: string; views: number }[],
  referrers: [] as { referrer: string; views: number }[],
  browsers: [] as { browser: string; views: number }[],
  avgSessionDuration: 0,
  bounceRate: 0,
  newVsReturning: { newUsers: 0, returningUsers: 0 },
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
    // Stub: GA4 not configured. Set GA4_CREDENTIALS and GA4_PROPERTY_ID to enable.
    res.status(HTTPSTATUS.OK).json({
      success: true,
      ga4Enabled: false,
      data: {
        message:
          "GA4 not configured. Set GA4_CREDENTIALS and GA4_PROPERTY_ID environment variables.",
        ...GA4_STUB_DATA,
      },
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
    res.status(HTTPSTATUS.OK).json({
      success: true,
      ga4Enabled: false,
      data: { configured: false, message: "GA4 is not configured" },
    });
  } catch {
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({ message: "Failed to get GA4 status" });
  }
}
