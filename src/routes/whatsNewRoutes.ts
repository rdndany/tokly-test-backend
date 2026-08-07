import { Router } from "express";
import { checkAuth } from "../middlewares/auth";
import {
  listPublishedWhatsNew,
  getPublishedWhatsNew,
  getWhatsNewUnreadCount,
  markWhatsNewSeen,
} from "../controllers/WhatsNewController";

const router = Router();

router.get("/", checkAuth, listPublishedWhatsNew);
router.get("/unread-count", checkAuth, getWhatsNewUnreadCount);
router.post("/mark-seen", checkAuth, markWhatsNewSeen);
router.get("/:id", checkAuth, getPublishedWhatsNew);

export default router;
