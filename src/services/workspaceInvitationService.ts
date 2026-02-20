import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import WorkspaceInvitationModel, {
  type InvitationRole,
  type InvitationStatus,
} from "../models/WorkspaceInvitation";
import WorkspaceMemberModel from "../models/WorkspaceMember";
import {
  ensureUserCanAccessWorkspace,
  ensureUserCanManageWorkspace,
} from "./workspaceService";

const INVITATION_EXPIRY_DAYS = 7;

export interface CreateInvitationInput {
  workspaceId: string;
  email: string;
  role: InvitationRole;
  invitedBy: string;
}

export interface InvitationItem {
  id: string;
  email: string;
  role: InvitationRole;
  invitedBy: string;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
}

export interface MemberItem {
  userId: string;
  email?: string;
  name?: string;
  role: string;
  joinedAt: string;
}

export async function createInvitation(
  input: CreateInvitationInput
): Promise<{ id: string; token: string; email: string; role: InvitationRole }> {
  const { workspaceId, email, role, invitedBy } = input;
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw new Error("Email is required");

  await ensureUserCanManageWorkspace(invitedBy, workspaceId);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);

  const existing = await WorkspaceInvitationModel.findOne({
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    email: normalizedEmail,
    status: "pending",
  }).lean();
  if (existing) {
    throw new Error(`An invitation for ${normalizedEmail} is already pending`);
  }

  const { default: UserModel } = await import("../models/User");
  const existingUser = await UserModel.findOne({
    email: normalizedEmail,
  }).lean();
  if (existingUser) {
    const existingMember = await WorkspaceMemberModel.findOne({
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      userId: existingUser._id,
    });
    if (existingMember) {
      throw new Error(`${normalizedEmail} is already a member of this workspace`);
    }
  }

  const token = uuidv4().replace(/-/g, "");
  const inv = await WorkspaceInvitationModel.create({
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    email: normalizedEmail,
    role,
    invitedBy,
    token,
    expiresAt,
    status: "pending",
  });

  return {
    id: inv._id.toString(),
    token,
    email: normalizedEmail,
    role,
  };
}

export async function listInvitations(
  workspaceId: string,
  userId: string
): Promise<InvitationItem[]> {
  const canAccess = await ensureUserCanAccessWorkspace(userId, workspaceId);
  if (!canAccess) throw new Error("Access denied to this workspace");

  const invitations = await WorkspaceInvitationModel.find({
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    status: "pending",
  })
    .sort({ createdAt: -1 })
    .lean();

  return invitations.map((inv) => ({
    id: inv._id.toString(),
    email: inv.email,
    role: inv.role,
    invitedBy: inv.invitedBy,
    status: inv.status,
    expiresAt: inv.expiresAt.toISOString(),
    createdAt: inv.createdAt.toISOString(),
  }));
}

export async function cancelInvitation(
  invitationId: string,
  workspaceId: string,
  userId: string
): Promise<{ inviteeEmail?: string }> {
  await ensureUserCanManageWorkspace(userId, workspaceId);

  const inv = await WorkspaceInvitationModel.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(invitationId),
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      status: "pending",
    },
    { status: "cancelled" }
  );
  if (!inv) throw new Error("Invitation not found or already processed");
  return { inviteeEmail: inv.email };
}

export async function getInvitationByToken(
  token: string
): Promise<{
  id: string;
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: InvitationRole;
  expiresAt: Date;
} | null> {
  const inv = await WorkspaceInvitationModel.findOne({
    token,
    status: "pending",
  }).lean();
  if (!inv || inv.expiresAt < new Date()) return null;

  const { default: WorkspaceModel } = await import("../models/Workspace");
  const ws = await WorkspaceModel.findById(inv.workspaceId)
    .select("name")
    .lean();
  if (!ws) return null;

  return {
    id: inv._id.toString(),
    workspaceId: inv.workspaceId.toString(),
    workspaceName: ws.name,
    email: inv.email,
    role: inv.role,
    expiresAt: inv.expiresAt,
  };
}

export async function acceptInvitationByToken(
  token: string,
  userId: string
): Promise<{ workspaceId: string }> {
  const inv = await WorkspaceInvitationModel.findOne({
    token,
    status: "pending",
  }).lean();
  if (!inv) throw new Error("Invitation not found or expired");
  if (inv.expiresAt < new Date()) {
    await WorkspaceInvitationModel.updateOne(
      { _id: inv._id },
      { status: "expired" }
    );
    throw new Error("Invitation has expired");
  }

  const workspaceId = inv.workspaceId.toString();

  const existing = await WorkspaceMemberModel.findOne({
    workspaceId: inv.workspaceId,
    userId,
  });
  if (existing) {
    await WorkspaceInvitationModel.updateOne(
      { _id: inv._id },
      { status: "accepted", acceptedAt: new Date(), acceptedBy: userId }
    );
    return { workspaceId };
  }

  await WorkspaceMemberModel.create({
    workspaceId: inv.workspaceId,
    userId,
    role: inv.role,
  });
  await WorkspaceInvitationModel.updateOne(
    { _id: inv._id },
    { status: "accepted", acceptedAt: new Date(), acceptedBy: userId }
  );

  return { workspaceId };
}

/** Process pending invitations for a user's email (call from Clerk user.created webhook).
 * Returns count and workspace IDs so callers can emit members:updated for each workspace. */
export async function processPendingInvitationsForEmail(
  email: string,
  userId: string
): Promise<{ count: number; workspaceIds: string[] }> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { count: 0, workspaceIds: [] };

  const pending = await WorkspaceInvitationModel.find({
    email: normalized,
    status: "pending",
  }).lean();

  const workspaceIds: string[] = [];
  for (const inv of pending) {
    if (inv.expiresAt < new Date()) {
      await WorkspaceInvitationModel.updateOne(
        { _id: inv._id },
        { status: "expired" }
      );
      continue;
    }

    const workspaceIdStr = inv.workspaceId.toString();
    const existing = await WorkspaceMemberModel.findOne({
      workspaceId: inv.workspaceId,
      userId,
    });
    if (existing) {
      await WorkspaceInvitationModel.updateOne(
        { _id: inv._id },
        { status: "accepted", acceptedAt: new Date(), acceptedBy: userId }
      );
      workspaceIds.push(workspaceIdStr);
      continue;
    }

    await WorkspaceMemberModel.create({
      workspaceId: inv.workspaceId,
      userId,
      role: inv.role,
    });
    await WorkspaceInvitationModel.updateOne(
      { _id: inv._id },
      { status: "accepted", acceptedAt: new Date(), acceptedBy: userId }
    );
    workspaceIds.push(workspaceIdStr);
  }
  return { count: workspaceIds.length, workspaceIds };
}

/** List pending workspace invitations for the current user (by email). */
export async function listMyPendingInvitations(
  userEmail: string
): Promise<
  {
    id: string;
    token: string;
    workspaceId: string;
    workspaceName: string;
    role: InvitationRole;
    invitedByName?: string;
    expiresAt: string;
    createdAt: string;
  }[]
> {
  const normalized = userEmail?.trim().toLowerCase();
  if (!normalized) return [];

  const invitations = await WorkspaceInvitationModel.find({
    email: normalized,
    status: "pending",
  })
    .sort({ createdAt: -1 })
    .lean();

  const now = new Date();
  const { default: WorkspaceModel } = await import("../models/Workspace");
  const { default: UserModel } = await import("../models/User");

  const results: Awaited<ReturnType<typeof listMyPendingInvitations>> = [];

  for (const inv of invitations) {
    if (inv.expiresAt < now) {
      await WorkspaceInvitationModel.updateOne(
        { _id: inv._id },
        { status: "expired" }
      );
      continue;
    }

    const [ws, inviter] = await Promise.all([
      WorkspaceModel.findById(inv.workspaceId).select("name").lean(),
      UserModel.findById(inv.invitedBy).select("name fullName").lean(),
    ]);

    const inviterName =
      inviter?.fullName?.trim() ?? inviter?.name ?? undefined;

    results.push({
      id: inv._id.toString(),
      token: inv.token,
      workspaceId: inv.workspaceId.toString(),
      workspaceName: ws?.name ?? "Workspace",
      role: inv.role,
      invitedByName: inviterName,
      expiresAt: inv.expiresAt.toISOString(),
      createdAt: inv.createdAt.toISOString(),
    });
  }

  return results;
}

/** Decline an invitation (invitee rejects). Sets status to cancelled. */
export async function declineInvitationByToken(
  token: string,
  userEmail: string
): Promise<void> {
  const normalized = userEmail?.trim().toLowerCase();
  if (!normalized) throw new Error("User email not found");

  const inv = await WorkspaceInvitationModel.findOne({
    token: token.trim(),
    status: "pending",
  }).lean();

  if (!inv) throw new Error("Invitation not found or already processed");
  if (inv.expiresAt < new Date()) {
    await WorkspaceInvitationModel.updateOne(
      { _id: inv._id },
      { status: "expired" }
    );
    throw new Error("Invitation has expired");
  }
  if (inv.email !== normalized) {
    throw new Error("Invitation is for a different email");
  }

  await WorkspaceInvitationModel.updateOne(
    { _id: inv._id },
    { status: "cancelled" }
  );
}

/** Create an invite link for a role. Anyone with the link can join the workspace with that role. */
export async function createInviteLink(
  workspaceId: string,
  role: InvitationRole,
  userId: string
): Promise<{ token: string; expiresAt: string }> {
  await ensureUserCanManageWorkspace(userId, workspaceId);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);

  const token = uuidv4().replace(/-/g, "");
  const placeholderEmail = `link-${token.slice(0, 12)}@invite.local`;

  await WorkspaceInvitationModel.create({
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    email: placeholderEmail,
    role,
    invitedBy: userId,
    token,
    expiresAt,
    status: "pending",
  });

  return {
    token,
    expiresAt: expiresAt.toISOString(),
  };
}
