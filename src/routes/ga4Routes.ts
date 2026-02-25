import { Router } from "express";
import { checkAuth } from "../middlewares/auth";
import { getGA4Analytics, getGA4Status } from "../controllers/GA4Controller";

const router = Router();

router.get("/project/:projectId", checkAuth, getGA4Analytics);
router.get("/status", checkAuth, getGA4Status);

export default router;
