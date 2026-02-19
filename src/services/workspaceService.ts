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
  };
}

export async function listWorkspacesByUser(
  userId: string
): Promise<WorkspaceListItem[]> {
  const memberships = await WorkspaceMemberModel.find({ userId })
    .select("workspaceId")
    .lean();
  const workspaceIds = memberships.map((m) => m.workspaceId);

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

export async function updateWorkspace(
  userId: string,
  workspaceId: string,
  input: { name?: string; avatar?: string | null }
): Promise<WorkspaceListItem> {
  const canAccess = await ensureUserCanAccessWorkspace(userId, workspaceId);
  if (!canAccess) {
    throw new Error("Access denied to this workspace");
  }

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
    return {
      id: w._id.toString(),
      name: w.name,
      avatar: w.avatar,
      createdBy: w.createdBy,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
      projectCount,
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

  return {
    id: workspace._id.toString(),
    name: workspace.name,
    avatar: workspace.avatar,
    createdBy: workspace.createdBy,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    projectCount,
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

  return members.map((m) => {
    const u = userMap.get(m.userId);
    const role = m.role === "member" ? "editor" : m.role;
    return {
      userId: m.userId,
      email: u?.email,
      name: u?.name ?? u?.fullName,
      image: u?.image,
      handle: u?.handle,
      role,
      joinedAt: (m as { createdAt: Date }).createdAt.toISOString(),
      isYou: m.userId === currentUserId,
    };
  });
}
