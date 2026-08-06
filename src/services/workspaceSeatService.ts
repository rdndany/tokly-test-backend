import mongoose from "mongoose";
import WorkspaceMemberModel from "../models/WorkspaceMember";
import WorkspaceInvitationModel from "../models/WorkspaceInvitation";
import { canInviteMembers, getMaxSeats, getPlanLabel } from "../config/plans";
import { getWorkspacePlanStatus } from "./workspaceService";

export async function getWorkspaceSeatUsage(workspaceId: string): Promise<{
  memberCount: number;
  pendingInviteCount: number;
  totalUsed: number;
}> {
  const wsId = new mongoose.Types.ObjectId(workspaceId);
  const [memberCount, pendingInviteCount] = await Promise.all([
    WorkspaceMemberModel.countDocuments({ workspaceId: wsId }),
    WorkspaceInvitationModel.countDocuments({
      workspaceId: wsId,
      status: "pending",
    }),
  ]);
  return {
    memberCount,
    pendingInviteCount,
    totalUsed: memberCount + pendingInviteCount,
  };
}

export async function assertWorkspaceCanAddSeats(
  workspaceId: string,
  additionalSeats = 1
): Promise<void> {
  const planStatus = await getWorkspacePlanStatus(workspaceId);
  if (!canInviteMembers(planStatus)) {
    throw new Error(
      `Your ${getPlanLabel(planStatus)} plan does not include team seats. Upgrade to Pro or higher to invite members.`
    );
  }

  const maxSeats = getMaxSeats(planStatus);
  if (maxSeats === null) return;

  const { totalUsed } = await getWorkspaceSeatUsage(workspaceId);
  if (totalUsed + additionalSeats > maxSeats) {
    throw new Error(
      `Your ${getPlanLabel(planStatus)} plan includes up to ${maxSeats} members (including the owner). Upgrade your plan to invite more people.`
    );
  }
}

/** Block joining when the workspace is already at capacity (e.g. stale invite link). */
export async function assertWorkspaceCanAcceptMember(
  workspaceId: string
): Promise<void> {
  const planStatus = await getWorkspacePlanStatus(workspaceId);
  const maxSeats = getMaxSeats(planStatus);
  if (maxSeats === null) return;

  const { memberCount } = await getWorkspaceSeatUsage(workspaceId);
  if (memberCount >= maxSeats) {
    throw new Error(
      `This workspace has reached its ${getPlanLabel(planStatus)} plan limit of ${maxSeats} members. Ask the owner to upgrade or remove a member.`
    );
  }
}
