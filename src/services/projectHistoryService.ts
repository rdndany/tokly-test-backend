import mongoose from "mongoose";
import ProjectHistoryModel from "../models/ProjectHistory";
import UserModel from "../models/User";
import ProjectModel from "../models/Project";
import { ensureUserCanAccessWorkspace } from "./workspaceService";

export async function logProjectChange(
  projectId: string,
  userId: string,
  description: string,
  section?: string
): Promise<void> {
  try {
    await ProjectHistoryModel.create({
      projectId: new mongoose.Types.ObjectId(projectId),
      userId,
      description: description.trim().slice(0, 500),
      section: section?.trim().slice(0, 100),
    });
  } catch {
    // Non-critical: don't fail the main operation if history logging fails
  }
}

export interface ProjectHistoryEntry {
  id: string;
  userId: string;
  userName: string;
  userImage?: string;
  description: string;
  section?: string;
  createdAt: string;
}

export async function getProjectHistory(
  userId: string,
  projectId: string,
  limit = 50
): Promise<ProjectHistoryEntry[]> {
  const project = await ProjectModel.findById(projectId).lean();
  if (!project) throw new Error("Project not found");

  const workspaceId = project.workspaceId?.toString();
  if (workspaceId) {
    const canAccess = await ensureUserCanAccessWorkspace(userId, workspaceId);
    if (!canAccess) throw new Error("Forbidden");
  } else if (project.userId !== userId) {
    throw new Error("Forbidden");
  }

  const entries = await ProjectHistoryModel.find({ projectId: new mongoose.Types.ObjectId(projectId) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const userIds = [...new Set(entries.map((e) => e.userId))];
  const userList = await UserModel.find({ _id: { $in: userIds } }).lean();
  const userNames = new Map(
    userList.map((u) => [u._id, u.handle ? `@${u.handle}` : u.fullName || u.name || "Unknown"])
  );
  const userImages = new Map(
    userList.filter((u) => u.image).map((u) => [u._id, u.image as string])
  );

  return entries.map((e) => ({
    id: (e as { _id: mongoose.Types.ObjectId })._id.toString(),
    userId: e.userId,
    userName: userNames.get(e.userId) ?? "Unknown",
    userImage: userImages.get(e.userId),
    description: e.description,
    section: e.section,
    createdAt: (e as { createdAt: Date }).createdAt.toISOString(),
  }));
}
