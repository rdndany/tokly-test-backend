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
  getSolanaWallet,
  updateSolanaWallet,
  getWithdrawalRequests,
  getWithdrawalStats,
  createWithdrawalRequest,
  cancelWithdrawalRequest,
} from "../controllers/AffiliateController";

const router = Router();

router.post("/generate", checkAuth, generateAffiliateCode);
router.get("/code", checkAuth, getAffiliateCode);
router.post("/track", trackReferral);
router.get("/referrals", checkAuth, getReferrals);
router.get("/stats", checkAuth, getAffiliateStats);
router.get("/accounts", checkAuth, getReferralAccounts);
router.get("/payments", checkAuth, getReferralPayments);
router.get("/wallet", checkAuth, getSolanaWallet);
router.patch("/wallet", checkAuth, updateSolanaWallet);
router.get("/withdrawals", checkAuth, getWithdrawalRequests);
router.get("/withdrawal-stats", checkAuth, getWithdrawalStats);
router.post("/withdraw", checkAuth, createWithdrawalRequest);
router.delete("/withdrawals/:requestId", checkAuth, cancelWithdrawalRequest);

export default router;
