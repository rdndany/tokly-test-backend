import UserModel from "../models/User";
import ProjectFileModel from "../models/ProjectFile";
import { getProjectById } from "./projectService";
import {
  ensureUserCanAccessWorkspace,
  getMemberRole,
} from "./workspaceService";

async function ensureUserCanAccessProject(
  userId: string,
  project: { userId: string; workspaceId?: { toString(): string } }
): Promise<void> {
  const { clerkClient } = await import("@clerk/express");
  const userDoc = await UserModel.findById(userId).select("role").lean();
  if (userDoc?.role === "admin") return;
  if (clerkClient) {
    try {
      const clerkUser = await clerkClient.users.getUser(userId);
      if (clerkUser.publicMetadata?.role === "admin") return;
    } catch {
      // Ignore
    }
  }

  const workspaceId = project.workspaceId?.toString();
  if (workspaceId) {
    const canAccess = await ensureUserCanAccessWorkspace(userId, workspaceId);
    if (!canAccess) throw new Error("Forbidden");
  } else if (project.userId !== userId) {
    throw new Error("Forbidden");
  }
}

async function ensureUserCanEditProject(
  userId: string,
  project: { userId: string; workspaceId?: { toString(): string } }
): Promise<void> {
  const { clerkClient } = await import("@clerk/express");
  const userDoc = await UserModel.findById(userId).select("role").lean();
  if (userDoc?.role === "admin") return;
  if (clerkClient) {
    try {
      const clerkUser = await clerkClient.users.getUser(userId);
      if (clerkUser.publicMetadata?.role === "admin") return;
    } catch {
      // Ignore
    }
  }

  const workspaceId = project.workspaceId?.toString();
  if (workspaceId) {
    const canAccess = await ensureUserCanAccessWorkspace(userId, workspaceId);
    if (!canAccess) throw new Error("Forbidden");
    const role = await getMemberRole(userId, workspaceId);
    if (role === "viewer") throw new Error("Forbidden");
  } else if (project.userId !== userId) {
    throw new Error("Forbidden");
  }
}

export async function listFiles(
  projectId: string,
  userId: string
): Promise<{ paths: string[] }> {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanAccessProject(userId, project);

  const files = await ProjectFileModel.find({ projectId })
    .select("path")
    .lean();
  const paths = files.map((f) => f.path).sort((a, b) => a.localeCompare(b));
  return { paths };
}

export async function getFileContent(
  projectId: string,
  path: string,
  userId: string
): Promise<string | null> {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanAccessProject(userId, project);

  const normalized = path.replace(/^\/+/, "").replace(/\/+/g, "/").trim();
  const doc = await ProjectFileModel.findOne({
    projectId,
    path: normalized,
  }).lean();
  return doc?.content ?? null;
}

export async function putFileContent(
  projectId: string,
  path: string,
  content: string,
  userId: string
): Promise<void> {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanEditProject(userId, project);

  const normalized = path.replace(/^\/+/, "").replace(/\/+/g, "/").trim();
  if (!normalized) throw new Error("Invalid path");

  await ProjectFileModel.findOneAndUpdate(
    { projectId, path: normalized },
    { $set: { content, updatedAt: new Date() } },
    { upsert: true, new: true }
  );
}
