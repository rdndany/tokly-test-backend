import { Request, Response } from "express";
import {
  submitChatFeedback,
  deleteChatFeedback,
} from "../services/chatFeedbackService";
import type { FeedbackCategory } from "../models/ChatFeedback";

export async function submitFeedback(req: Request, res: Response): Promise<void> {
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
    userMessage?: string;
    assistantMessage?: string;
    feedbackType?: "positive" | "negative";
    category?: FeedbackCategory;
    additionalFeedback?: string;
  };

  const userMessage = typeof body?.userMessage === "string" ? body.userMessage.trim() : "";
  const assistantMessage = typeof body?.assistantMessage === "string" ? body.assistantMessage.trim() : "";
  const feedbackType = body?.feedbackType;

  if (!userMessage || !assistantMessage) {
    res.status(400).json({ error: "User message and assistant message are required" });
    return;
  }
  if (feedbackType !== "positive" && feedbackType !== "negative") {
    res.status(400).json({ error: "Feedback type must be 'positive' or 'negative'" });
    return;
  }

  const validCategories = ["design_off", "unrelated_changes", "functionality_broken", "other"];
  const category =
    feedbackType === "negative" && body.category && validCategories.includes(body.category)
      ? (body.category as FeedbackCategory)
      : undefined;

  const additionalFeedback =
    feedbackType === "negative" && typeof body?.additionalFeedback === "string"
      ? body.additionalFeedback.trim()
      : undefined;

  try {
    await submitChatFeedback({
      projectId,
      userId,
      userMessage,
      assistantMessage,
      feedbackType,
      category,
      additionalFeedback,
    });
    res.status(201).json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to submit feedback";
    const status = msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function removeFeedback(req: Request, res: Response): Promise<void> {
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
    userMessage?: string;
    assistantMessage?: string;
  };

  const userMessage = typeof body?.userMessage === "string" ? body.userMessage.trim() : "";
  const assistantMessage =
    typeof body?.assistantMessage === "string" ? body.assistantMessage.trim() : "";

  if (!userMessage || !assistantMessage) {
    res
      .status(400)
      .json({ error: "User message and assistant message are required" });
    return;
  }

  try {
    await deleteChatFeedback({
      projectId,
      userId,
      userMessage,
      assistantMessage,
    });
    res.status(200).json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to remove feedback";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}
