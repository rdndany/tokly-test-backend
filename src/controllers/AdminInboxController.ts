import { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { HTTPSTATUS } from "../config/http.config";
import { createLogger } from "../utils/logger";
import * as InboxService from "../services/inboxService";

const logger = createLogger("AdminInboxController");

function getAdminId(req: Request): string | null {
  return req.auth?.userId ?? getAuth(req)?.userId ?? null;
}

export async function composeInboxThreads(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const adminUserId = getAdminId(req);
    if (!adminUserId) {
      res.status(HTTPSTATUS.UNAUTHORIZED).json({ message: "Unauthorized" });
      return;
    }
    const { subject, body, userIds, allUsers } = req.body as {
      subject?: string;
      body?: string;
      userIds?: string[];
      allUsers?: boolean;
    };
    const result = await InboxService.composeThreads(adminUserId, {
      subject: subject ?? "",
      body: body ?? "",
      userIds,
      allUsers: Boolean(allUsers),
    });
    res.status(HTTPSTATUS.OK).json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to compose message";
    const status =
      message.includes("required") ||
      message.includes("Select") ||
      message.includes("too long") ||
      message.includes("found")
        ? HTTPSTATUS.BAD_REQUEST
        : HTTPSTATUS.INTERNAL_SERVER_ERROR;
    if (status === HTTPSTATUS.INTERNAL_SERVER_ERROR) {
      logger.error("composeInboxThreads error:", error);
    }
    res.status(status).json({ message });
  }
}

export async function listAdminInboxThreads(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const unreadOnly =
      req.query.unread === "1" || req.query.unread === "true";
    const threads = await InboxService.listThreadsForAdmin({ unreadOnly });
    res.status(HTTPSTATUS.OK).json({ threads });
  } catch (error) {
    logger.error("listAdminInboxThreads error:", error);
    res
      .status(HTTPSTATUS.INTERNAL_SERVER_ERROR)
      .json({ message: "Failed to list inbox threads" });
  }
}

export async function getAdminInboxThread(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const threadId = req.params.threadId;
    if (!threadId) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "threadId is required" });
      return;
    }
    const thread = await InboxService.getThreadForAdmin(threadId);
    res.status(HTTPSTATUS.OK).json(thread);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get thread";
    const status =
      message === "Thread not found"
        ? HTTPSTATUS.NOT_FOUND
        : HTTPSTATUS.INTERNAL_SERVER_ERROR;
    if (status === HTTPSTATUS.INTERNAL_SERVER_ERROR) {
      logger.error("getAdminInboxThread error:", error);
    }
    res.status(status).json({ message });
  }
}

export async function replyAdminInboxThread(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const adminUserId = getAdminId(req);
    if (!adminUserId) {
      res.status(HTTPSTATUS.UNAUTHORIZED).json({ message: "Unauthorized" });
      return;
    }
    const threadId = req.params.threadId;
    const body = (req.body as { body?: string })?.body;
    if (!threadId) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "threadId is required" });
      return;
    }
    const message = await InboxService.replyAsAdmin(
      adminUserId,
      threadId,
      body ?? ""
    );
    res.status(HTTPSTATUS.OK).json({ message });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send reply";
    const status =
      message === "Thread not found"
        ? HTTPSTATUS.NOT_FOUND
        : message.includes("required") ||
            message.includes("too long") ||
            message.includes("closed")
          ? HTTPSTATUS.BAD_REQUEST
          : HTTPSTATUS.INTERNAL_SERVER_ERROR;
    if (status === HTTPSTATUS.INTERNAL_SERVER_ERROR) {
      logger.error("replyAdminInboxThread error:", error);
    }
    res.status(status).json({ message });
  }
}

export async function markAdminInboxThreadRead(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const threadId = req.params.threadId;
    if (!threadId) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "threadId is required" });
      return;
    }
    await InboxService.markThreadReadByAdmin(threadId);
    res.status(HTTPSTATUS.OK).json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to mark read";
    const status =
      message === "Thread not found"
        ? HTTPSTATUS.NOT_FOUND
        : HTTPSTATUS.INTERNAL_SERVER_ERROR;
    if (status === HTTPSTATUS.INTERNAL_SERVER_ERROR) {
      logger.error("markAdminInboxThreadRead error:", error);
    }
    res.status(status).json({ message });
  }
}

export async function getInboxRecipientCount(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const count = await InboxService.countAllUsers();
    res.status(HTTPSTATUS.OK).json({ count });
  } catch (error) {
    logger.error("getInboxRecipientCount error:", error);
    res
      .status(HTTPSTATUS.INTERNAL_SERVER_ERROR)
      .json({ message: "Failed to count users" });
  }
}

export async function closeAdminInboxThread(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const adminUserId = getAdminId(req);
    if (!adminUserId) {
      res.status(HTTPSTATUS.UNAUTHORIZED).json({ message: "Unauthorized" });
      return;
    }
    const threadId = req.params.threadId;
    if (!threadId) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "threadId is required" });
      return;
    }
    const thread = await InboxService.closeThread(adminUserId, threadId);
    res.status(HTTPSTATUS.OK).json({ thread });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to close conversation";
    const status =
      message === "Thread not found"
        ? HTTPSTATUS.NOT_FOUND
        : HTTPSTATUS.INTERNAL_SERVER_ERROR;
    if (status === HTTPSTATUS.INTERNAL_SERVER_ERROR) {
      logger.error("closeAdminInboxThread error:", error);
    }
    res.status(status).json({ message });
  }
}

export async function reopenAdminInboxThread(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const adminUserId = getAdminId(req);
    if (!adminUserId) {
      res.status(HTTPSTATUS.UNAUTHORIZED).json({ message: "Unauthorized" });
      return;
    }
    const threadId = req.params.threadId;
    if (!threadId) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "threadId is required" });
      return;
    }
    const thread = await InboxService.reopenThread(adminUserId, threadId);
    res.status(HTTPSTATUS.OK).json({ thread });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reopen conversation";
    const status =
      message === "Thread not found"
        ? HTTPSTATUS.NOT_FOUND
        : HTTPSTATUS.INTERNAL_SERVER_ERROR;
    if (status === HTTPSTATUS.INTERNAL_SERVER_ERROR) {
      logger.error("reopenAdminInboxThread error:", error);
    }
    res.status(status).json({ message });
  }
}
