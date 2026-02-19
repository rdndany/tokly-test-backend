import { getAuth } from "@clerk/express";
import { NextFunction, Request, Response } from "express";
import { HTTPSTATUS } from "../config/http.config";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        sessionId: string;
      };
    }
  }
}

/** Sets req.auth when a valid token is present; does not require auth. Use for routes that work with or without auth. */
export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  const auth = getAuth(req);
  if (auth?.userId) {
    req.auth = {
      userId: auth.userId,
      sessionId: auth.sessionId ?? "",
    };
  }
  next();
};

export const checkAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const auth = getAuth(req);

  if (!auth?.userId) {
    res.status(HTTPSTATUS.UNAUTHORIZED).json({ message: "Unauthorized" });
    return;
  }

  req.auth = {
    userId: auth.userId,
    sessionId: auth.sessionId ?? "",
  };

  next();
};
