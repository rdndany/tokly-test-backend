import { Router } from "express";
import { checkAuth } from "../middlewares/auth";
import {
  getInvitationByTokenHandler,
  acceptInvitation,
  listMyPendingInvitationsHandler,
  declineInvitationHandler,
} from "../controllers/invitationController";

const router = Router();

/** Auth required. Lists the current user's pending workspace invitations. */
router.get("/me", checkAuth, listMyPendingInvitationsHandler);

/** Public - no auth. Used by invite accept page to show workspace name before sign-in. */
router.get("/", getInvitationByTokenHandler);

/** Auth required. Accepts the invitation. */
router.post("/accept", checkAuth, acceptInvitation);

/** Auth required. Declines the invitation. */
router.post("/decline", checkAuth, declineInvitationHandler);

export default router;
