import { Router } from "express";
import { getActive } from "../controllers/AnnouncementController";

const router = Router();

router.get("/active", getActive);

export default router;
