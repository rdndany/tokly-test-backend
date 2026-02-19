import { Request, Response } from "express";
import {
  listFiles,
  getFileContent,
  putFileContent,
} from "../services/projectFileService";

export async function getFiles(req: Request, res: Response): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const path = typeof req.query.path === "string" ? req.query.path.trim() : null;

  try {
    if (path) {
      const content = await getFileContent(projectId, path, userId);
      if (content === null) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      res.status(200).json({ path, content });
    } else {
      const result = await listFiles(projectId, userId);
      res.status(200).json(result);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to get files";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function putFile(req: Request, res: Response): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const body = req.body as { path?: string; content?: string };
  const path = typeof body?.path === "string" ? body.path.trim() : "";
  const content = typeof body?.content === "string" ? body.content : "";

  if (!path) {
    res.status(400).json({ error: "Path is required" });
    return;
  }

  try {
    await putFileContent(projectId, path, content, userId);
    res.status(200).json({ path, ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to save file";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

