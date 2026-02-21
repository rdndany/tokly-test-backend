import { Router } from "express";
import { checkAuth } from "../middlewares/auth";
import {
  createProCheckoutSession,
  createTopUpCheckoutSession,
  createBillingPortalSession,
} from "../controllers/StripeController";

const router = Router();

router.post("/create-checkout-session", checkAuth, createProCheckoutSession);
router.post("/create-topup-session", checkAuth, createTopUpCheckoutSession);
router.post("/create-portal-session", checkAuth, createBillingPortalSession);

export default router;
