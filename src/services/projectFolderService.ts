import mongoose from "mongoose";
import ProjectFolderModel from "../models/ProjectFolder";
import ProjectModel from "../models/Project";
import WorkspaceMemberModel from "../models/WorkspaceMember";
import {
  ensureUserCanAccessWorkspace,
  ensureUserCanEditInWorkspace,
} from "./workspaceService";
import { ensureUserCanEditProject } from "./projectService";
import type { ProjectFolderType } from "../models/ProjectFolder";

export interface ProjectFolderListItem {
  id: string;
  name: string;
  type: ProjectFolderType;
  userId: string;
  workspaceId?: string | null;
  parentFolderId?: string | null;
  projectCount: number;
  createdAt: Date;
  updatedAt: Date;
  /** Depth in tree: 0 = root, 1 = subfolder, 2 = sub-subfolder (max) */
  depth?: number;
}

export async function createFolder(
  userId: string,
  input: {
    name: string;
    type: ProjectFolderType;
    workspaceId?: string | null;
    parentFolderId?: string | null;
  }
): Promise<ProjectFolderListItem> {
  const name = input.name?.trim() || "New folder";
  if (name.length > 100) {
    throw new Error("Folder name must be 100 characters or less");
  }

  if (input.type === "workspace") {
    const workspaceId = input.workspaceId?.trim();
    if (!workspaceId) {
      throw new Error("Workspace ID is required for workspace folders");
    }
    await ensureUserCanEditInWorkspace(userId, workspaceId);
  }

  const MAX_SUBFOLDER_DEPTH = 2; // Folder → Sub folder → Sub folder (3 levels total)

  if (input.parentFolderId) {
    const parent = await ProjectFolderModel.findById(input.parentFolderId).lean();
    if (!parent) throw new Error("Parent folder not found");
    if (parent.type === "personal" && parent.userId !== userId) {
      throw new Error("Access denied to this folder");
    }
    if (parent.type === "workspace" && parent.workspaceId) {
      await ensureUserCanEditInWorkspace(
        userId,
        parent.workspaceId.toString()
      );
    }
    if (parent.type === "personal" && input.type === "workspace") {
      throw new Error(
        "Workspace subfolders are not allowed inside personal folders. Team members cannot see the parent."
      );
    }
    const parentDepth = await getFolderDepth(parent);
    if (parentDepth >= MAX_SUBFOLDER_DEPTH) {
      throw new Error("Maximum folder depth reached. You can only have Folder → Sub folder → Sub folder.");
    }
  }

  const folder = await ProjectFolderModel.create({
    name,
    type: input.type,
    userId,
    workspaceId: input.type === "workspace" && input.workspaceId
      ? new mongoose.Types.ObjectId(input.workspaceId)
      : null,
    parentFolderId: input.parentFolderId
      ? new mongoose.Types.ObjectId(input.parentFolderId)
      : null,
  });

  const projectCount = await ProjectModel.countDocuments({
    folderId: folder._id,
  });

  const depth = await getFolderDepth(folder);

  return {
    id: folder._id.toString(),
    name: folder.name,
    type: folder.type,
    userId: folder.userId,
    workspaceId: folder.workspaceId?.toString() ?? null,
    parentFolderId: folder.parentFolderId?.toString() ?? null,
    projectCount,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
    depth,
  };
}

async function getFolderDepth(folder: { parentFolderId?: mongoose.Types.ObjectId | null }): Promise<number> {
  if (!folder.parentFolderId) return 0;
  const parent = await ProjectFolderModel.findById(folder.parentFolderId).lean();
  if (!parent) return 0;
  return 1 + (await getFolderDepth(parent));
}

async function canAccessFolder(
  userId: string,
  folder: {
    userId: string;
    type: ProjectFolderType;
    workspaceId?: mongoose.Types.ObjectId | null;
  }
): Promise<boolean> {
  if (folder.type === "personal") {
    return folder.userId === userId;
  }
  if (folder.type === "workspace" && folder.workspaceId) {
    return ensureUserCanAccessWorkspace(userId, folder.workspaceId.toString());
  }
  return false;
}

/** Throws if user cannot modify this folder (viewers cannot edit workspace folders). */
async function ensureUserCanEditFolder(
  userId: string,
  folder: {
    type: string;
    userId?: string;
    workspaceId?: mongoose.Types.ObjectId | null;
  }
): Promise<void> {
  if (folder.type === "personal") {
    if (folder.userId !== userId) throw new Error("Access denied to this folder");
    return;
  }
  if (folder.type === "workspace" && folder.workspaceId) {
    await ensureUserCanEditInWorkspace(userId, folder.workspaceId.toString());
  }
}

export async function listFolders(
  userId: string,
  options?: {
    workspaceId?: string;
    parentFolderId?: string | null;
    type?: ProjectFolderType;
    all?: boolean;
  }
): Promise<ProjectFolderListItem[]> {
  const filter: Record<string, unknown> = {};

  if (options?.type === "personal") {
    filter.type = "personal";
    filter.userId = userId;
  } else if (options?.type === "workspace" && options?.workspaceId) {
    const canAccess = await ensureUserCanAccessWorkspace(
      userId,
      options.workspaceId
    );
    if (!canAccess) return [];
    filter.type = "workspace";
    filter.workspaceId = new mongoose.Types.ObjectId(options.workspaceId);
  } else if (options?.workspaceId) {
    const canAccess = await ensureUserCanAccessWorkspace(
      userId,
      options.workspaceId
    );
    if (!canAccess) return [];
    filter.$or = [
      { type: "personal", userId },
      {
        type: "workspace",
        workspaceId: new mongoose.Types.ObjectId(options.workspaceId),
      },
    ];
  } else {
    filter.$or = [
      { type: "personal", userId },
      {
        type: "workspace",
        workspaceId: { $in: await getWorkspaceIdsForUser(userId) },
      },
    ];
  }

  if (!options?.all && options?.parentFolderId !== undefined) {
    filter.parentFolderId = options.parentFolderId
      ? new mongoose.Types.ObjectId(options.parentFolderId)
      : null;
  }

  const folders = await ProjectFolderModel.find(filter)
    .sort({ name: 1 })
    .lean();

  const ids = folders.map((f) => f._id);
  const projectCounts = await ProjectModel.aggregate([
    { $match: { folderId: { $in: ids } } },
    { $group: { _id: "$folderId", count: { $sum: 1 } } },
  ]);
  const countMap = new Map(
    projectCounts.map((c) => [c._id.toString(), c.count])
  );

  const folderMap = new Map(
    folders.map((f) => [f._id.toString(), { parentFolderId: f.parentFolderId }])
  );
  const getDepthSync = (id: string): number => {
    const entry = folderMap.get(id);
    if (!entry?.parentFolderId) return 0;
    return 1 + getDepthSync(entry.parentFolderId.toString());
  };

  return folders.map((f) => ({
    id: f._id.toString(),
    name: f.name,
    type: f.type,
    userId: f.userId,
    workspaceId: f.workspaceId?.toString() ?? null,
    parentFolderId: f.parentFolderId?.toString() ?? null,
    projectCount: countMap.get(f._id.toString()) ?? 0,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    depth: getDepthSync(f._id.toString()),
  }));
}

async function getWorkspaceIdsForUser(userId: string): Promise<mongoose.Types.ObjectId[]> {
  const memberships = await WorkspaceMemberModel.find({ userId })
    .select("workspaceId")
    .lean();
  return memberships.map((m) => m.workspaceId).filter(Boolean);
}

/** Returns folder names from root to the folder (breadcrumb path) */
export async function getFolderPath(folderId: string): Promise<string[]> {
  const segments = await getFolderPathWithIds(folderId);
  return segments.map((s) => s.name);
}

/** Returns folder path from root to the folder with IDs for breadcrumb links */
export async function getFolderPathWithIds(
  folderId: string
): Promise<{ id: string; name: string }[]> {
  const folder = await ProjectFolderModel.findById(folderId).lean();
  if (!folder) return [];
  const parentPath = folder.parentFolderId
    ? await getFolderPathWithIds(folder.parentFolderId.toString())
    : [];
  return [...parentPath, { id: folder._id.toString(), name: folder.name }];
}

export async function getFolderById(
  folderId: string
): Promise<ProjectFolderListItem | null> {
  const folder = await ProjectFolderModel.findById(folderId).lean();
  if (!folder) return null;

  const projectCount = await ProjectModel.countDocuments({
    folderId: folder._id,
  });

  const depth = await getFolderDepth(folder);

  return {
    id: folder._id.toString(),
    name: folder.name,
    type: folder.type,
    userId: folder.userId,
    workspaceId: folder.workspaceId?.toString() ?? null,
    parentFolderId: folder.parentFolderId?.toString() ?? null,
    projectCount,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
    depth,
  };
}

export async function updateFolder(
  userId: string,
  folderId: string,
  input: { name?: string }
): Promise<ProjectFolderListItem> {
  const folder = await ProjectFolderModel.findById(folderId).lean();
  if (!folder) throw new Error("Folder not found");

  await ensureUserCanEditFolder(userId, folder);

  const name = input.name?.trim();
  if (!name) throw new Error("Folder name is required");
  if (name.length > 100) throw new Error("Folder name must be 100 characters or less");

  await ProjectFolderModel.updateOne(
    { _id: folderId },
    { $set: { name } }
  );

  const updated = await getFolderById(folderId);
  if (!updated) throw new Error("Folder not found");
  return updated;
}

async function deleteFolderRecursive(
  folderId: mongoose.Types.ObjectId
): Promise<void> {
  const subfolders = await ProjectFolderModel.find({
    parentFolderId: folderId,
  }).lean();

  for (const sub of subfolders) {
    await deleteFolderRecursive(sub._id);
  }

  await ProjectModel.updateMany(
    { folderId },
    { $unset: { folderId: 1 } }
  );

  await ProjectFolderModel.findByIdAndDelete(folderId);
}

export async function deleteFolder(
  userId: string,
  folderId: string
): Promise<void> {
  const folder = await ProjectFolderModel.findById(folderId).lean();
  if (!folder) throw new Error("Folder not found");

  await ensureUserCanEditFolder(userId, folder);

  await deleteFolderRecursive(folder._id);
}

export async function addProjectsToFolder(
  userId: string,
  folderId: string,
  projectIds: string[]
): Promise<void> {
  const folder = await ProjectFolderModel.findById(folderId).lean();
  if (!folder) throw new Error("Folder not found");

  await ensureUserCanEditFolder(userId, folder);

  const validIds = projectIds.filter((id) => id?.trim()).map((id) => id.trim());
  if (validIds.length === 0) return;

  const projectIdObjs = validIds.map((id) => new mongoose.Types.ObjectId(id));
  const projects = await ProjectModel.find({
    _id: { $in: projectIdObjs },
  }).lean();

  for (const project of projects) {
    if (folder.type === "personal") {
      if (project.userId !== userId) continue;
    } else if (folder.workspaceId) {
      try {
        await ensureUserCanEditInWorkspace(
          userId,
          project.workspaceId?.toString() ?? ""
        );
      } catch {
        continue;
      }
      if (project.workspaceId?.toString() !== folder.workspaceId.toString()) {
        continue;
      }
    }
    await ProjectModel.updateOne(
      { _id: project._id },
      { $set: { folderId: new mongoose.Types.ObjectId(folderId) } }
    );
  }
}

export async function removeProjectFromFolder(
  userId: string,
  projectId: string
): Promise<void> {
  const project = await ProjectModel.findById(projectId).lean();
  if (!project) throw new Error("Project not found");

  await ensureUserCanEditProject(userId, {
    userId: project.userId,
    workspaceId: project.workspaceId,
  });

  await ProjectModel.updateOne(
    { _id: projectId },
    { $unset: { folderId: 1 } }
  );
}
