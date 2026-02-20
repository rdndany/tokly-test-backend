import { Router } from "express";
import { checkAuth } from "../middlewares/auth";
import {
  listWorkspaces,
  createWorkspace,
  updateWorkspace,
  leaveWorkspace,
  listMembers,
  updateMemberRole,
  removeMember,
  createInvitations,
  createInviteLink,
  listInvitations,
  cancelInvitation,
} from "../controllers/WorkspaceController";

const router = Router();

router.get("/", checkAuth, listWorkspaces);
router.post("/", checkAuth, createWorkspace);
router.patch("/:workspaceId", checkAuth, updateWorkspace);
router.post("/:workspaceId/leave", checkAuth, leaveWorkspace);

router.get("/:workspaceId/members", checkAuth, listMembers);
router.patch("/:workspaceId/members/:userId", checkAuth, updateMemberRole);
router.delete("/:workspaceId/members/:userId", checkAuth, removeMember);
router.post("/:workspaceId/invitations", checkAuth, createInvitations);
router.post("/:workspaceId/invite-link", checkAuth, createInviteLink);
router.get("/:workspaceId/invitations", checkAuth, listInvitations);
router.delete("/:workspaceId/invitations/:invitationId", checkAuth, cancelInvitation);

export default router;
