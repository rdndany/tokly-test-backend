import { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { HTTPSTATUS } from "../config/http.config";
import { createLogger } from "../utils/logger";
import * as InboxService from "../services/inboxService";

const logger = createLogger("InboxController");

function getUserId(req: Request): string | null {
  return req.auth?.userId ?? getAuth(req)?.userId ?? null;
}

export async function listMyThreads(req: Request, res: Response): Promise<void> {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(HTTPSTATUS.UNAUTHORIZED).json({ message: "Unauthorized" });
      return;
    }
    const threads = await InboxService.listThreadsForUser(userId);
    res.status(HTTPSTATUS.OK).json({ threads });
  } catch (error) {
    logger.error("listMyThreads error:", error);
    res
      .status(HTTPSTATUS.INTERNAL_SERVER_ERROR)
      .json({ message: "Failed to list inbox threads" });
  }
}

export async function getMyThread(req: Request, res: Response): Promise<void> {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(HTTPSTATUS.UNAUTHORIZED).json({ message: "Unauthorized" });
      return;
    }
    const threadId = req.params.threadId;
    if (!threadId) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "threadId is required" });
      return;
    }
    const thread = await InboxService.getThreadForUser(userId, threadId);
    res.status(HTTPSTATUS.OK).json(thread);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get thread";
    const status =
      message === "Forbidden"
        ? HTTPSTATUS.FORBIDDEN
        : message === "Thread not found"
          ? HTTPSTATUS.NOT_FOUND
          : HTTPSTATUS.INTERNAL_SERVER_ERROR;
    if (status === HTTPSTATUS.INTERNAL_SERVER_ERROR) {
      logger.error("getMyThread error:", error);
    }
    res.status(status).json({ message });
  }
}

export async function replyToMyThread(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(HTTPSTATUS.UNAUTHORIZED).json({ message: "Unauthorized" });
      return;
    }
    const threadId = req.params.threadId;
    const body = (req.body as { body?: string })?.body;
    if (!threadId) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "threadId is required" });
      return;
    }
    const message = await InboxService.replyAsUser(userId, threadId, body ?? "");
    res.status(HTTPSTATUS.OK).json({ message });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send reply";
    const status =
      message === "Forbidden"
        ? HTTPSTATUS.FORBIDDEN
        : message === "Thread not found"
          ? HTTPSTATUS.NOT_FOUND
          : message.includes("required") || message.includes("too long")
            ? HTTPSTATUS.BAD_REQUEST
            : HTTPSTATUS.INTERNAL_SERVER_ERROR;
    if (status === HTTPSTATUS.INTERNAL_SERVER_ERROR) {
      logger.error("replyToMyThread error:", error);
    }
    res.status(status).json({ message });
  }
}

export async function markMyThreadRead(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(HTTPSTATUS.UNAUTHORIZED).json({ message: "Unauthorized" });
      return;
    }
    const threadId = req.params.threadId;
    if (!threadId) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "threadId is required" });
      return;
    }
    await InboxService.markThreadReadByUser(userId, threadId);
    res.status(HTTPSTATUS.OK).json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to mark read";
    const status =
      message === "Forbidden"
        ? HTTPSTATUS.FORBIDDEN
        : message === "Thread not found"
          ? HTTPSTATUS.NOT_FOUND
          : HTTPSTATUS.INTERNAL_SERVER_ERROR;
    if (status === HTTPSTATUS.INTERNAL_SERVER_ERROR) {
      logger.error("markMyThreadRead error:", error);
    }
    res.status(status).json({ message });
  }
}

export async function getMyUnreadCount(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(HTTPSTATUS.UNAUTHORIZED).json({ message: "Unauthorized" });
      return;
    }
    const summary = await InboxService.getUserUnreadSummary(userId);
    res.status(HTTPSTATUS.OK).json(summary);
  } catch (error) {
    logger.error("getMyUnreadCount error:", error);
    res
      .status(HTTPSTATUS.INTERNAL_SERVER_ERROR)
      .json({ message: "Failed to get unread count" });
  }
}
