import { Router } from "express";
import { checkAuth } from "../middlewares/auth";
import {
  createProCheckoutSession,
  createBillingPortalSession,
} from "../controllers/StripeController";

const router = Router();

router.post("/create-checkout-session", checkAuth, createProCheckoutSession);
router.post("/create-portal-session", checkAuth, createBillingPortalSession);

export default router;
