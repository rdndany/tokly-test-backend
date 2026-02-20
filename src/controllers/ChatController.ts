import { Request, Response } from "express";
import {
  addQuestionnaireCompletion,
  getConversation,
  sendMessage,
} from "../services/chatService";

export async function getChatHistory(req: Request, res: Response): Promise<void> {
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
  try {
    const history = await getConversation(projectId, userId);
    res.status(200).json({ history });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to get history";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function chat(req: Request, res: Response): Promise<void> {
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

  const body = req.body as { message?: string };
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  try {
    const result = await sendMessage(projectId, userId, message);
    const body: { message: string; history: typeof result.fullHistory; creditsRemaining?: number } = {
      message: result.message,
      history: result.fullHistory,
    };
    if (result.creditsRemaining != null) body.creditsRemaining = result.creditsRemaining;
    res.status(200).json(body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Chat failed";
    const code = (err as { code?: string }).code;
    const status =
      code === "INSUFFICIENT_CREDITS" ? 402
      : msg === "Project not found" ? 404
      : msg === "Forbidden" ? 403
      : 500;
    res.status(status).json({ error: msg });
  }
}

export async function saveQuestionnaire(req: Request, res: Response): Promise<void> {
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
  const body = req.body as {
    title?: string;
    items?: { label: string; completed?: boolean }[];
    followUpContent?: string;
    imageUrl?: string;
  };
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const items = Array.isArray(body?.items)
    ? body.items
        .filter((i): i is { label: string; completed?: boolean } => typeof i?.label === "string")
        .map((i) => ({ label: i.label, completed: i.completed ?? true }))
    : [];
  const followUpContent =
    typeof body?.followUpContent === "string" ? body.followUpContent.trim() : undefined;
  const imageUrl =
    typeof body?.imageUrl === "string" ? body.imageUrl.trim() : undefined;
  if (!title || items.length === 0) {
    res.status(400).json({ error: "Title and items are required" });
    return;
  }
  try {
    await addQuestionnaireCompletion(projectId, userId, {
      title,
      items,
      followUpContent: followUpContent || undefined,
      imageUrl: imageUrl || undefined,
    });
    const history = await getConversation(projectId, userId);
    res.status(200).json({ history });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to save questionnaire";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}
