import { Router } from "express";
import { checkAuth } from "../middlewares/auth";
import {
  incrementView,
  getTodayStats,
  getStatsRange,
  getTotalStats,
  recordPresence,
  getActiveCount,
} from "../controllers/DailyStatsController";

const router = Router();

router.post("/increment", incrementView);
router.post("/presence", recordPresence);
router.get("/project/:projectId/today", checkAuth, getTodayStats);
router.get("/project/:projectId/range", checkAuth, getStatsRange);
router.get("/project/:projectId/total", checkAuth, getTotalStats);
router.get("/project/:projectId/active", checkAuth, getActiveCount);

export default router;
