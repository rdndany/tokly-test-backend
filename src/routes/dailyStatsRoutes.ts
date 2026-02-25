import { Router } from "express";
import { checkAuth } from "../middlewares/auth";
import {
  incrementView,
  getTodayStats,
  getStatsRange,
  getTotalStats,
} from "../controllers/DailyStatsController";

const router = Router();

router.post("/increment", incrementView);
router.get("/project/:projectId/today", checkAuth, getTodayStats);
router.get("/project/:projectId/range", checkAuth, getStatsRange);
router.get("/project/:projectId/total", checkAuth, getTotalStats);

export default router;
