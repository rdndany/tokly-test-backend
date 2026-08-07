import { Router } from "express";
import { checkAuth } from "../middlewares/auth";
import {
  listMyThreads,
  getMyThread,
  replyToMyThread,
  markMyThreadRead,
  getMyUnreadCount,
} from "../controllers/InboxController";

const router = Router();

router.get("/threads", checkAuth, listMyThreads);
router.get("/threads/:threadId", checkAuth, getMyThread);
router.post("/threads/:threadId/messages", checkAuth, replyToMyThread);
router.post("/threads/:threadId/read", checkAuth, markMyThreadRead);
router.get("/unread-count", checkAuth, getMyUnreadCount);

export default router;
