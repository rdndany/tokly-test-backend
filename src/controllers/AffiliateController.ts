import { Request, Response } from "express";
import { HTTPSTATUS } from "../config/http.config";
import * as AffiliateService from "../services/affiliateService";
import { createLogger } from "../utils/logger";

const logger = createLogger("AffiliateController");

function getUserId(req: Request): string {
  const id = req.auth?.userId;
  if (!id) {
    throw new Error("Unauthorized");
  }
  return id;
}

export async function generateAffiliateCode(req: Request, res: Response): Promise<void> {
  try {
    const userId = getUserId(req);
    const affiliateCode = await AffiliateService.generateAffiliateCode(userId);
    res.status(HTTPSTATUS.OK).json({ success: true, affiliateCode });
  } catch (err) {
    logger.error("Error generating affiliate code", err);
    const message = err instanceof Error ? err.message : "Failed to generate affiliate code";
    res.status(HTTPSTATUS.BAD_REQUEST).json({ success: false, message });
  }
}

export async function getAffiliateCode(req: Request, res: Response): Promise<void> {
  try {
    const userId = getUserId(req);
    const affiliateCode = await AffiliateService.getAffiliateCode(userId);
    res.status(HTTPSTATUS.OK).json({ success: true, affiliateCode: affiliateCode ?? null });
  } catch (err) {
    logger.error("Error getting affiliate code", err);
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({ message: "Failed to get affiliate code" });
  }
}

export async function trackReferral(req: Request, res: Response): Promise<void> {
  try {
    const { affiliateCode, referredUserId } = req.body as { affiliateCode?: string; referredUserId?: string };
    if (!affiliateCode || !referredUserId) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "Affiliate code and referred user ID are required" });
      return;
    }
    const referrer = await AffiliateService.getUserByAffiliateCode(affiliateCode);
    if (!referrer) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "Invalid affiliate code" });
      return;
    }
    if (referrer._id === referredUserId) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "Users cannot refer themselves" });
      return;
    }
    const referral = await AffiliateService.trackReferral(referrer._id, referredUserId);
    res.status(HTTPSTATUS.OK).json({ success: true, referral });
  } catch (err) {
    logger.error("Error tracking referral", err);
    const message = err instanceof Error ? err.message : "Failed to track referral";
    res.status(HTTPSTATUS.BAD_REQUEST).json({ message });
  }
}

export async function getReferrals(req: Request, res: Response): Promise<void> {
  try {
    const userId = getUserId(req);
    const referrals = await AffiliateService.getReferrals(userId);
    res.status(HTTPSTATUS.OK).json({ success: true, referrals });
  } catch (err) {
    logger.error("Error getting referrals", err);
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({ message: "Failed to get referrals" });
  }
}

export async function getAffiliateStats(req: Request, res: Response): Promise<void> {
  try {
    const userId = getUserId(req);
    const stats = await AffiliateService.getAffiliateStats(userId);
    res.status(HTTPSTATUS.OK).json({ success: true, stats });
  } catch (err) {
    logger.error("Error getting affiliate stats", err);
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({ message: "Failed to get affiliate stats" });
  }
}

export async function getReferralAccounts(req: Request, res: Response): Promise<void> {
  try {
    const userId = getUserId(req);
    const referralAccounts = await AffiliateService.getReferralAccounts(userId);
    res.status(HTTPSTATUS.OK).json({ success: true, referralAccounts });
  } catch (err) {
    logger.error("Error getting referral accounts", err);
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({ message: "Failed to get referral accounts" });
  }
}

export async function getReferralPayments(req: Request, res: Response): Promise<void> {
  try {
    const userId = getUserId(req);
    const payments = await AffiliateService.getReferralPayments(userId);
    res.status(HTTPSTATUS.OK).json({ success: true, payments });
  } catch (err) {
    logger.error("Error getting referral payments", err);
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({ message: "Failed to get referral payments" });
  }
}
