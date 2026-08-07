import { clerkClient, getAuth } from "@clerk/express";
import { NextFunction, Request, Response } from "express";
import { HTTPSTATUS } from "../config/http.config";
import { createLogger } from "../utils/logger";

const logger = createLogger("AdminAuth");

export const checkAdminAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const auth = getAuth(req);

    if (!auth?.userId) {
      res.status(HTTPSTATUS.UNAUTHORIZED).json({ message: "Unauthorized" });
      return;
    }

    const user = await clerkClient.users.getUser(auth.userId);
    const role = user.publicMetadata?.role as string | undefined;
    const isAdmin = role === "admin";

    if (!isAdmin) {
      res
        .status(HTTPSTATUS.FORBIDDEN)
        .json({ message: "Admin access required" });
      return;
    }

    req.auth = {
      userId: auth.userId,
      sessionId: auth.sessionId ?? "",
    };

    next();
  } catch (error) {
    logger.error("Admin check error:", error);
    res
      .status(HTTPSTATUS.INTERNAL_SERVER_ERROR)
      .json({ message: "Internal server error" });
  }
};
