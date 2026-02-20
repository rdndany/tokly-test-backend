import mongoose from "mongoose";
import WorkspaceModel from "../models/Workspace";
import WorkspaceMemberModel, {
  type WorkspaceRole,
} from "../models/WorkspaceMember";
import ProjectModel from "../models/Project";

/** Per-user lock to prevent race: multiple concurrent calls creating duplicate default workspaces */
const defaultWorkspaceCreationByUser = new Map<string, Promise<WorkspaceListItem>>();

export interface WorkspaceListItem {
  id: string;
  name: string;
  avatar?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  projectCount?: number;
  /** Current user's role in this workspace (for UI: viewer = read-only) */
  role?: WorkspaceRole;
}

export async function createWorkspace(
  userId: string,
  input: { name: string }
): Promise<WorkspaceListItem> {
  const name = input.name?.trim() || "New Workspace";
  if (name.length > 100) {
    throw new Error("Workspace name must be 100 characters or less");
  }

  const workspace = await WorkspaceModel.create({ name, createdBy: userId });
  await WorkspaceMemberModel.create({
    workspaceId: workspace._id,
    userId,
    role: "owner",
  });

  return {
    id: workspace._id.toString(),
    name: workspace.name,
    avatar: workspace.avatar,
    createdBy: workspace.createdBy,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    projectCount: 0,
    role: "owner",
  };
}

export async function listWorkspacesByUser(
  userId: string
): Promise<WorkspaceListItem[]> {
  const memberships = await WorkspaceMemberModel.find({ userId })
    .select("workspaceId role")
    .lean();
  const workspaceIds = memberships.map((m) => m.workspaceId);
  const roleMap = new Map(
    memberships.map((m) => {
      const role = m.role === "member" ? "editor" : (m.role as WorkspaceRole);
      return [m.workspaceId.toString(), role];
    })
  );

  if (workspaceIds.length === 0) {
    return [];
  }

  const workspaces = await WorkspaceModel.find({
    _id: { $in: workspaceIds },
  })
    .sort({ createdAt: 1 })
    .lean();

  const projectCounts = await ProjectModel.aggregate([
    { $match: { workspaceId: { $in: workspaceIds } } },
    { $group: { _id: "$workspaceId", count: { $sum: 1 } } },
  ]);
  const countMap = new Map(
    projectCounts.map((c) => [c._id.toString(), c.count])
  );

  return workspaces.map((w) => ({
    id: w._id.toString(),
    name: w.name,
    avatar: w.avatar,
    createdBy: w.createdBy,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
    projectCount: countMap.get(w._id.toString()) ?? 0,
    role: roleMap.get(w._id.toString()) ?? "editor",
  }));
}

export async function getOrCreateDefaultWorkspace(
  userId: string
): Promise<WorkspaceListItem> {
  let promise = defaultWorkspaceCreationByUser.get(userId);
  if (!promise) {
    promise = (async () => {
      try {
        const workspaces = await listWorkspacesByUser(userId);
        if (workspaces.length > 0) {
          return workspaces[0];
        }

        const workspace = await WorkspaceModel.create({
          name: "My Workspace",
          createdBy: userId,
        });
        await WorkspaceMemberModel.create({
          workspaceId: workspace._id,
          userId,
          role: "owner",
        });
        // Migrate existing projects (no workspaceId) to this default workspace
        await ProjectModel.updateMany(
          { userId, workspaceId: { $exists: false } },
          { $set: { workspaceId: workspace._id } }
        );
        await ProjectModel.updateMany(
          { userId, workspaceId: null },
          { $set: { workspaceId: workspace._id } }
        );

        const projectCount = await ProjectModel.countDocuments({
          workspaceId: workspace._id,
        });
        return {
          id: workspace._id.toString(),
          name: workspace.name,
          avatar: workspace.avatar,
          createdBy: workspace.createdBy,
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
          projectCount,
        };
      } finally {
        defaultWorkspaceCreationByUser.delete(userId);
      }
    })();
    defaultWorkspaceCreationByUser.set(userId, promise);
  }
  return promise;
}

export async function ensureUserCanAccessWorkspace(
  userId: string,
  workspaceId: string
): Promise<boolean> {
  const member = await WorkspaceMemberModel.findOne({
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    userId,
  }).lean();
  return !!member;
}

export async function getMemberRole(
  userId: string,
  workspaceId: string
): Promise<WorkspaceRole | null> {
  const member = await WorkspaceMemberModel.findOne({
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    userId,
  })
    .select("role")
    .lean();
  return (member?.role as WorkspaceRole) ?? null;
}

/** Owner and admin can manage members/invitations */
export async function ensureUserCanManageWorkspace(
  userId: string,
  workspaceId: string
): Promise<void> {
  const role = await getMemberRole(userId, workspaceId);
  if (!role) throw new Error("Access denied to this workspace");
  if (role !== "owner" && role !== "admin") {
    throw new Error("Only workspace owners and admins can manage members");
  }
}

/** Viewers can only read; editors, admins, and owners can create/edit/delete. */
export async function ensureUserCanEditInWorkspace(
  userId: string,
  workspaceId: string
): Promise<void> {
  const role = await getMemberRole(userId, workspaceId);
  if (!role) throw new Error("Access denied to this workspace");
  if (role === "viewer") {
    throw new Error("Viewers cannot modify workspace content");
  }
}

export async function updateWorkspace(
  userId: string,
  workspaceId: string,
  input: { name?: string; avatar?: string | null }
): Promise<WorkspaceListItem> {
  await ensureUserCanEditInWorkspace(userId, workspaceId);

  const setUpdate: Record<string, unknown> = {};
  const unsetUpdate: Record<string, 1> = {};
  if (input.name !== undefined) {
    const name = input.name?.trim() || "New Workspace";
    if (name.length > 100) {
      throw new Error("Workspace name must be 100 characters or less");
    }
    setUpdate.name = name;
  }
  if (input.avatar !== undefined) {
    if (input.avatar) {
      setUpdate.avatar = input.avatar;
    } else {
      unsetUpdate.avatar = 1;
    }
  }

  const updateOp: Record<string, unknown> = {};
  if (Object.keys(setUpdate).length) updateOp.$set = setUpdate;
  if (Object.keys(unsetUpdate).length) updateOp.$unset = unsetUpdate;
  if (Object.keys(updateOp).length === 0) {
    const w = await WorkspaceModel.findById(workspaceId).lean();
    if (!w) throw new Error("Workspace not found");
    const projectCount = await ProjectModel.countDocuments({
      workspaceId: w._id,
    });
    const role = await getMemberRole(userId, workspaceId);
    const normRole = role === "member" ? "editor" : (role ?? "editor");
    return {
      id: w._id.toString(),
      name: w.name,
      avatar: w.avatar,
      createdBy: w.createdBy,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
      projectCount,
      role: normRole as WorkspaceRole,
    };
  }

  const workspace = await WorkspaceModel.findByIdAndUpdate(
    workspaceId,
    updateOp,
    { new: true, runValidators: true }
  ).lean();

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  const projectCount = await ProjectModel.countDocuments({
    workspaceId: workspace._id,
  });

  const role = await getMemberRole(userId, workspaceId);
  const normRole = role === "member" ? "editor" : (role ?? "editor");

  return {
    id: workspace._id.toString(),
    name: workspace.name,
    avatar: workspace.avatar,
    createdBy: workspace.createdBy,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    projectCount,
    role: normRole as WorkspaceRole,
  };
}

export async function leaveWorkspace(
  userId: string,
  workspaceId: string
): Promise<void> {
  const canAccess = await ensureUserCanAccessWorkspace(userId, workspaceId);
  if (!canAccess) {
    throw new Error("Access denied to this workspace");
  }

  const workspaces = await listWorkspacesByUser(userId);
  if (workspaces.length <= 1) {
    throw new Error(
      "Your account must be a member of at least one workspace. You cannot leave your last workspace."
    );
  }

  await WorkspaceMemberModel.deleteOne({
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    userId,
  });
}

const MANAGABLE_ROLES: WorkspaceRole[] = ["admin", "editor", "viewer"];

/** Update a member's role. Caller must be owner or admin. Cannot change owner's role. */
export async function updateMemberRole(
  workspaceId: string,
  memberUserId: string,
  newRole: "admin" | "editor" | "viewer",
  currentUserId: string
): Promise<void> {
  await ensureUserCanManageWorkspace(currentUserId, workspaceId);

  const member = await WorkspaceMemberModel.findOne({
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    userId: memberUserId,
  });
  if (!member) throw new Error("Member not found");
  if (memberUserId === currentUserId) {
    throw new Error("You cannot change your own role");
  }
  if (member.role === "owner") {
    throw new Error("Cannot change the owner's role");
  }
  if (!MANAGABLE_ROLES.includes(newRole as WorkspaceRole)) {
    throw new Error("Invalid role");
  }

  member.role = newRole as WorkspaceRole;
  await member.save();
}

/** Remove a member from the workspace. Caller must be owner or admin. Cannot remove owner. */
export async function removeMember(
  workspaceId: string,
  memberUserId: string,
  currentUserId: string
): Promise<void> {
  await ensureUserCanManageWorkspace(currentUserId, workspaceId);

  const member = await WorkspaceMemberModel.findOne({
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    userId: memberUserId,
  });
  if (!member) throw new Error("Member not found");
  if (memberUserId === currentUserId) {
    throw new Error("You cannot remove yourself from the workspace");
  }
  if (member.role === "owner") {
    throw new Error("Cannot remove the workspace owner");
  }

  await WorkspaceMemberModel.deleteOne({
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    userId: memberUserId,
  });
}

export interface WorkspaceMemberListItem {
  userId: string;
  email?: string;
  name?: string;
  image?: string;
  handle?: string;
  role: string;
  joinedAt: string;
  isYou?: boolean;
}

export async function listWorkspaceMembers(
  workspaceId: string,
  currentUserId: string
): Promise<WorkspaceMemberListItem[]> {
  const canAccess = await ensureUserCanAccessWorkspace(currentUserId, workspaceId);
  if (!canAccess) {
    throw new Error("Access denied to this workspace");
  }

  const members = await WorkspaceMemberModel.find({
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
  })
    .sort({ createdAt: 1 })
    .lean();

  const { default: UserModel } = await import("../models/User");
  const users = await UserModel.find({
    _id: { $in: members.map((m) => m.userId) },
  }).lean();

  const userMap = new Map(users.map((u) => [u._id, u]));

  const isClerkUserId = (s: string) => /^user_[a-zA-Z0-9]+$/.test(s);

  return members.map((m) => {
    const u = userMap.get(m.userId);
    const role = m.role === "member" ? "editor" : m.role;
    const effectiveName =
      u?.name && !isClerkUserId(u.name)
        ? u.name
        : (u?.fullName?.trim() || undefined);
    const displayName = u?.handle
      ? `@${u.handle}`
      : effectiveName || u?.email || "Member";
    return {
      userId: m.userId,
      email: u?.email,
      name: displayName,
      image: u?.image,
      handle: u?.handle,
      role,
      joinedAt: (m as { createdAt: Date }).createdAt.toISOString(),
      isYou: m.userId === currentUserId,
    };
  });
}
