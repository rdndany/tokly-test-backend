import { Request, Response } from "express";
import { createLogger } from "../utils/logger";
import {
  createFolder,
  listFolders,
  getFolderById,
  updateFolder,
  deleteFolder,
  addProjectsToFolder,
} from "../services/projectFolderService";
import { emitFoldersUpdated } from "../socket/events";

const logger = createLogger("ProjectFolderController");

export async function createFolderHandler(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const type = req.body?.type === "workspace" ? "workspace" : "personal";
  const workspaceId =
    typeof req.body?.workspaceId === "string" ? req.body.workspaceId : undefined;
  const parentFolderId =
    typeof req.body?.parentFolderId === "string"
      ? req.body.parentFolderId
      : undefined;

  try {
    const folder = await createFolder(userId, {
      name: name || "New folder",
      type,
      workspaceId: type === "workspace" ? workspaceId : undefined,
      parentFolderId: parentFolderId || null,
    });
    emitFoldersUpdated({
      workspaceId: folder.workspaceId,
      userId: folder.userId,
      type: folder.type,
    });
    res.status(201).json(folder);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create folder";
    const status =
      msg === "Access denied to this workspace" ||
      msg === "Access denied to this folder"
        ? 403
        : 400;
    res.status(status).json({ error: msg });
  }
}

export async function listFoldersHandler(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const workspaceId =
    typeof req.query.workspaceId === "string" ? req.query.workspaceId : undefined;
  const all = req.query.all === "true";
  const rawParentId = all
    ? undefined
    : typeof req.query.parentFolderId === "string"
      ? req.query.parentFolderId.trim() || null
      : null;
  const type =
    req.query.type === "workspace"
      ? "workspace"
      : req.query.type === "personal"
        ? "personal"
        : undefined;

  try {
    const folders = await listFolders(userId, {
      workspaceId,
      parentFolderId: rawParentId,
      type,
      all,
    });
    res.status(200).json({ folders });
  } catch (err) {
    logger.error("List folders error:", err);
    res.status(500).json({ error: "Failed to list folders" });
  }
}

export async function getFolderHandler(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const folderId = req.params.folderId;
  if (!folderId) {
    res.status(400).json({ error: "Folder ID is required" });
    return;
  }

  try {
    const folder = await getFolderById(folderId);
    if (!folder) {
      res.status(404).json({ error: "Folder not found" });
      return;
    }
    const { ensureUserCanAccessWorkspace } = await import(
      "../services/workspaceService"
    );
    if (folder.type === "personal" && folder.userId !== userId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    if (folder.type === "workspace" && folder.workspaceId) {
      const canAccess = await ensureUserCanAccessWorkspace(
        userId,
        folder.workspaceId
      );
      if (!canAccess) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
    }
    res.status(200).json(folder);
  } catch (err) {
    logger.error("Get folder error:", err);
    res.status(500).json({ error: "Failed to get folder" });
  }
}

export async function updateFolderHandler(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const folderId = req.params.folderId;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : undefined;

  if (!folderId || !name) {
    res.status(400).json({ error: "Folder ID and name are required" });
    return;
  }

  try {
    const folder = await updateFolder(userId, folderId, { name });
    emitFoldersUpdated({
      workspaceId: folder.workspaceId,
      userId: folder.userId,
      type: folder.type,
    });
    res.status(200).json(folder);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update folder";
    const status =
      msg === "Folder not found" ? 404 : msg === "Access denied to this folder" ? 403 : 400;
    res.status(status).json({ error: msg });
  }
}

export async function deleteFolderHandler(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const folderId = req.params.folderId;
  if (!folderId) {
    res.status(400).json({ error: "Folder ID is required" });
    return;
  }

  try {
    const folder = await getFolderById(folderId);
    await deleteFolder(userId, folderId);
    if (folder) {
      emitFoldersUpdated({
        workspaceId: folder.workspaceId,
        userId: folder.userId,
        type: folder.type,
      });
    }
    res.status(204).send();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to delete folder";
    const status =
      msg === "Folder not found" ? 404 : msg === "Access denied to this folder" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function addProjectsToFolderHandler(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const folderId = req.params.folderId;
  const projectIds = Array.isArray(req.body?.projectIds)
    ? req.body.projectIds.filter((id: unknown): id is string => typeof id === "string")
    : [];

  if (!folderId) {
    res.status(400).json({ error: "Folder ID is required" });
    return;
  }

  try {
    await addProjectsToFolder(userId, folderId, projectIds);
    res.status(204).send();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to add projects";
    const status =
      msg === "Folder not found" ? 404 : msg === "Access denied to this folder" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}
