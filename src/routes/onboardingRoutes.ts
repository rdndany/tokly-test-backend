import { Router } from "express";
import { checkHandle, completeOnboarding } from "../controllers/OnboardingController";
import { checkAuth, optionalAuth } from "../middlewares/auth";

const router = Router();

router.get("/check-handle", optionalAuth, checkHandle);
router.post("/onboarding", checkAuth, completeOnboarding);

export default router;
