import { Router } from "express";
import { checkAuth } from "../middlewares/auth";
import {
  generateAffiliateCode,
  getAffiliateCode,
  trackReferral,
  getReferrals,
  getAffiliateStats,
  getReferralAccounts,
  getReferralPayments,
} from "../controllers/AffiliateController";

const router = Router();

router.post("/generate", checkAuth, generateAffiliateCode);
router.get("/code", checkAuth, getAffiliateCode);
router.post("/track", trackReferral);
router.get("/referrals", checkAuth, getReferrals);
router.get("/stats", checkAuth, getAffiliateStats);
router.get("/accounts", checkAuth, getReferralAccounts);
router.get("/payments", checkAuth, getReferralPayments);

export default router;
