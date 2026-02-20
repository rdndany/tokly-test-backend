import { Router } from "express";
import { checkAuth } from "../middlewares/auth";
import { createProCheckoutSession } from "../controllers/StripeController";

const router = Router();

router.post("/create-checkout-session", checkAuth, createProCheckoutSession);

export default router;
