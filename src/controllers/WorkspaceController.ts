import { Request, Response } from "express";
import { createLogger } from "../utils/logger";
import config from "../config";
import { sendWorkspaceInvitationMail } from "../services/emailService";
import {
  createWorkspace as createWorkspaceService,
  listWorkspacesByUser,
  getOrCreateDefaultWorkspace,
  updateWorkspace as updateWorkspaceService,
  leaveWorkspace as leaveWorkspaceService,
  listWorkspaceMembers as listWorkspaceMembersService,
} from "../services/workspaceService";
import {
  createInvitation,
  createInviteLink as createInviteLinkService,
  listInvitations as listInvitationsService,
  cancelInvitation as cancelInvitationService,
} from "../services/workspaceInvitationService";
import { emitInvitationsUpdated } from "../socket/events";
import WorkspaceModel from "../models/Workspace";
import UserModel from "../models/User";

const logger = createLogger("WorkspaceController");

export async function listWorkspaces(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    let workspaces = await listWorkspacesByUser(userId);
    if (workspaces.length === 0) {
      const defaultWorkspace = await getOrCreateDefaultWorkspace(userId);
      workspaces = [defaultWorkspace];
    }
    res.status(200).json({ workspaces });
  } catch (error) {
    logger.error("List workspaces error:", error);
    res.status(500).json({ error: "Failed to list workspaces" });
  }
}

export async function createWorkspace(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const name =
    typeof req.body?.name === "string" ? req.body.name.trim() : undefined;

  if (!name) {
    res.status(400).json({ error: "Workspace name is required" });
    return;
  }

  try {
    const workspace = await createWorkspaceService(userId, { name });
    res.status(201).json(workspace);
  } catch (error) {
    logger.error("Create workspace error:", error);
    const msg =
      error instanceof Error ? error.message : "Failed to create workspace";
    res.status(400).json({ error: msg });
  }
}

export async function updateWorkspace(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const workspaceId =
    typeof req.params?.workspaceId === "string" ? req.params.workspaceId : undefined;
  const name =
    typeof req.body?.name === "string" ? req.body.name.trim() : undefined;
  const avatar =
    req.body?.avatar === null || req.body?.avatar === ""
      ? null
      : typeof req.body?.avatar === "string"
        ? req.body.avatar.trim()
        : undefined;

  if (!workspaceId) {
    res.status(400).json({ error: "Workspace ID is required" });
    return;
  }
  if (name === undefined && avatar === undefined) {
    res.status(400).json({ error: "At least one of name or avatar is required" });
    return;
  }

  const updateInput: { name?: string; avatar?: string | null } = {};
  if (name !== undefined) updateInput.name = name;
  if (avatar !== undefined) updateInput.avatar = avatar;

  try {
    const workspace = await updateWorkspaceService(userId, workspaceId, updateInput);
    res.status(200).json(workspace);
  } catch (error) {
    logger.error("Update workspace error:", error);
    const msg =
      error instanceof Error ? error.message : "Failed to update workspace";
    res.status(400).json({ error: msg });
  }
}

export async function leaveWorkspace(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const workspaceId =
    typeof req.params?.workspaceId === "string" ? req.params.workspaceId : undefined;

  if (!workspaceId) {
    res.status(400).json({ error: "Workspace ID is required" });
    return;
  }

  try {
    await leaveWorkspaceService(userId, workspaceId);
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error("Leave workspace error:", error);
    const msg =
      error instanceof Error ? error.message : "Failed to leave workspace";
    res.status(400).json({ error: msg });
  }
}

const INVITATION_ROLES = ["admin", "editor", "viewer"] as const;

export async function listMembers(req: Request, res: Response): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const workspaceId =
    typeof req.params?.workspaceId === "string" ? req.params.workspaceId : undefined;

  if (!workspaceId) {
    res.status(400).json({ error: "Workspace ID is required" });
    return;
  }

  try {
    const members = await listWorkspaceMembersService(workspaceId, userId);
    res.status(200).json({ members });
  } catch (error) {
    logger.error("List members error:", error);
    const msg =
      error instanceof Error ? error.message : "Failed to list members";
    res.status(400).json({ error: msg });
  }
}

export async function createInvitations(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const workspaceId =
    typeof req.params?.workspaceId === "string" ? req.params.workspaceId : undefined;
  const emailsInput = req.body?.emails;
  const roleInput = req.body?.role;

  if (!workspaceId) {
    res.status(400).json({ error: "Workspace ID is required" });
    return;
  }

  const emails: string[] = Array.isArray(emailsInput)
    ? emailsInput
        .flatMap((e: unknown) =>
          typeof e === "string" ? e.split(",").map((s) => s.trim()) : []
        )
        .filter(Boolean)
    : typeof emailsInput === "string"
      ? emailsInput
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  if (emails.length === 0) {
    res.status(400).json({ error: "At least one email is required" });
    return;
  }

  const role =
    typeof roleInput === "string" && INVITATION_ROLES.includes(roleInput as (typeof INVITATION_ROLES)[number])
      ? (roleInput as (typeof INVITATION_ROLES)[number])
      : "editor";

  const [workspace, inviter] = await Promise.all([
    WorkspaceModel.findById(workspaceId).select("name").lean(),
    UserModel.findById(userId).select("name fullName").lean(),
  ]);

  if (!workspace) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  const inviterName = inviter?.name ?? inviter?.fullName ?? "A team member";
  const workspaceName = workspace.name;
  const baseUrl = config.app?.url ?? "https://tokly.io";

  const results: {
    email: string;
    success: boolean;
    id?: string;
    error?: string;
  }[] = [];

  for (const email of emails) {
    try {
      const inv = await createInvitation({
        workspaceId,
        email,
        role,
        invitedBy: userId,
      });
      const acceptUrl = `${baseUrl}/invitations/accept?token=${inv.token}`;
      const sent = await sendWorkspaceInvitationMail(email, {
        inviterName,
        workspaceName,
        role,
        acceptUrl,
        expiresInDays: 7,
      });

      if (!sent.success) {
        logger.warn("Invitation created but email failed", {
          email,
          error: sent.error,
        });
      }

      // Notify invitee in real-time if they have an account
      const inviteeUser = await UserModel.findOne({
        email: email.trim().toLowerCase(),
      })
        .select("_id")
        .lean();
      if (inviteeUser?._id) {
        emitInvitationsUpdated(String(inviteeUser._id));
      }

      results.push({ email, success: true, id: inv.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to invite";
      results.push({ email, success: false, error: msg });
    }
  }

  const invitations = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  res.status(201).json({
    invitations,
    failed: failed.length > 0 ? failed : undefined,
  });
}

export async function listInvitations(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const workspaceId =
    typeof req.params?.workspaceId === "string" ? req.params.workspaceId : undefined;

  if (!workspaceId) {
    res.status(400).json({ error: "Workspace ID is required" });
    return;
  }

  try {
    const invitations = await listInvitationsService(workspaceId, userId);
    res.status(200).json({ invitations });
  } catch (error) {
    logger.error("List invitations error:", error);
    const msg =
      error instanceof Error ? error.message : "Failed to list invitations";
    res.status(400).json({ error: msg });
  }
}

export async function createInviteLink(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const workspaceId =
    typeof req.params?.workspaceId === "string" ? req.params.workspaceId : undefined;
  const roleInput = req.body?.role;

  if (!workspaceId) {
    res.status(400).json({ error: "Workspace ID is required" });
    return;
  }

  const role =
    typeof roleInput === "string" && INVITATION_ROLES.includes(roleInput as (typeof INVITATION_ROLES)[number])
      ? (roleInput as (typeof INVITATION_ROLES)[number])
      : "editor";

  try {
    const { token, expiresAt } = await createInviteLinkService(
      workspaceId,
      role,
      userId
    );
    const baseUrl = config.app?.url ?? "https://tokly.io";
    const url = `${baseUrl}/invitations/accept?token=${token}`;
    res.status(201).json({ url, token, expiresAt });
  } catch (error) {
    logger.error("Create invite link error:", error);
    const msg =
      error instanceof Error ? error.message : "Failed to create invite link";
    res.status(400).json({ error: msg });
  }
}

export async function cancelInvitation(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const workspaceId =
    typeof req.params?.workspaceId === "string" ? req.params.workspaceId : undefined;
  const invitationId =
    typeof req.params?.invitationId === "string" ? req.params.invitationId : undefined;

  if (!workspaceId || !invitationId) {
    res.status(400).json({ error: "Workspace ID and invitation ID are required" });
    return;
  }

  try {
    const { inviteeEmail } = await cancelInvitationService(
      invitationId,
      workspaceId,
      userId
    );
    if (inviteeEmail) {
      const inviteeUser = await UserModel.findOne({
        email: inviteeEmail.trim().toLowerCase(),
      })
        .select("_id")
        .lean();
      if (inviteeUser?._id) {
        emitInvitationsUpdated(String(inviteeUser._id));
      }
    }
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error("Cancel invitation error:", error);
    const msg =
      error instanceof Error ? error.message : "Failed to cancel invitation";
    res.status(400).json({ error: msg });
  }
}
