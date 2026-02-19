import { Request, Response } from "express";
import { createLogger } from "../utils/logger";
import {
  getInvitationByToken,
  acceptInvitationByToken,
  listMyPendingInvitations,
  declineInvitationByToken,
} from "../services/workspaceInvitationService";
import UserModel from "../models/User";
import { clerkClient } from "@clerk/express";

const logger = createLogger("InvitationController");

async function getUserEmail(userId: string): Promise<string | null> {
  const user = await UserModel.findById(userId).select("email").lean();
  if (user?.email) return user.email;
  try {
    const clerkUser = await clerkClient.users.getUser(userId);
    return clerkUser.primaryEmailAddress?.emailAddress ?? null;
  } catch {
    return null;
  }
}

/** Public endpoint - no auth required. Returns invitation details for accept page. */
export async function getInvitationByTokenHandler(
  req: Request,
  res: Response
): Promise<void> {
  const token =
    typeof req.query?.token === "string" ? req.query.token.trim() : undefined;

  if (!token) {
    res.status(400).json({ error: "Token is required" });
    return;
  }

  try {
    const invitation = await getInvitationByToken(token);
    if (!invitation) {
      res.status(404).json({
        error: "Invitation not found or expired",
        code: "INVITATION_NOT_FOUND",
      });
      return;
    }

    res.status(200).json(invitation);
  } catch (error) {
    logger.error("Get invitation by token error:", error);
    res.status(500).json({ error: "Failed to get invitation" });
  }
}

/** Requires auth. Accepts the invitation and adds user to workspace. */
export async function acceptInvitation(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token =
    typeof req.body?.token === "string" ? req.body.token.trim() : undefined;

  if (!token) {
    res.status(400).json({ error: "Token is required" });
    return;
  }

  try {
    const result = await acceptInvitationByToken(token, userId);
    res.status(200).json({ workspaceId: result.workspaceId });
  } catch (error) {
    logger.error("Accept invitation error:", error);
    const msg =
      error instanceof Error ? error.message : "Failed to accept invitation";
    res.status(400).json({ error: msg });
  }
}

/** Requires auth. Lists the current user's pending workspace invitations. */
export async function listMyPendingInvitationsHandler(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const email = await getUserEmail(userId);
    if (!email) {
      res.status(200).json({ invitations: [] });
      return;
    }
    const invitations = await listMyPendingInvitations(email);
    res.status(200).json({ invitations });
  } catch (error) {
    logger.error("List my invitations error:", error);
    res.status(500).json({ error: "Failed to list invitations" });
  }
}

/** Requires auth. Declines an invitation. */
export async function declineInvitationHandler(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token =
    typeof req.body?.token === "string" ? req.body.token.trim() : undefined;

  if (!token) {
    res.status(400).json({ error: "Token is required" });
    return;
  }

  try {
    const email = await getUserEmail(userId);
    if (!email) {
      res.status(400).json({ error: "User email not found" });
      return;
    }
    await declineInvitationByToken(token, email);
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error("Decline invitation error:", error);
    const msg =
      error instanceof Error ? error.message : "Failed to decline invitation";
    res.status(400).json({ error: msg });
  }
}
