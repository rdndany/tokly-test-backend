import { Request, Response } from "express";
import { createLogger } from "../utils/logger";

const logger = createLogger("UserController");
import {
  getPublicProfileByHandle,
  follow as followService,
  unfollow as unfollowService,
} from "../services/userService";
import { listPublicProjectsByUserId } from "../services/projectService";
import { HANDLE_REGEX } from "../services/onboardingService";
import { getCredits } from "../services/creditsService";
import UserModel from "../models/User";

export async function getProfileByHandle(
  req: Request,
  res: Response
): Promise<void> {
  const handle = (req.params.handle ?? "").trim().toLowerCase();
  if (!handle) {
    res.status(400).json({ error: "Handle is required" });
    return;
  }
  if (!HANDLE_REGEX.test(handle)) {
    res.status(400).json({ error: "Invalid handle format" });
    return;
  }

  const currentUserId = req.auth?.userId;

  try {
    const profile = await getPublicProfileByHandle(handle, currentUserId);
    if (!profile) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.status(200).json(profile);
  } catch (error) {
    logger.error("Get profile by handle error:", error);
    res.status(500).json({ error: "Failed to load profile" });
  }
}

export async function follow(req: Request, res: Response): Promise<void> {
  const handle = (req.body?.handle ?? "").trim().toLowerCase();
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!handle) {
    res.status(400).json({ error: "Handle is required" });
    return;
  }
  if (!HANDLE_REGEX.test(handle)) {
    res.status(400).json({ error: "Invalid handle format" });
    return;
  }

  try {
    const result = await followService(userId, handle);
    if (!result.success) {
      res.status(400).json({ error: result.message ?? "Failed to follow" });
      return;
    }
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error("Follow error:", error);
    res.status(500).json({ error: "Failed to follow" });
  }
}

export async function getProfileProjects(
  req: Request,
  res: Response
): Promise<void> {
  const handle = (req.params.handle ?? "").trim().toLowerCase();
  if (!handle) {
    res.status(400).json({ error: "Handle is required" });
    return;
  }
  if (!HANDLE_REGEX.test(handle)) {
    res.status(400).json({ error: "Invalid handle format" });
    return;
  }

  try {
    const profile = await getPublicProfileByHandle(handle);
    if (!profile) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const projects = await listPublicProjectsByUserId(profile.id);
    res.status(200).json({ projects });
  } catch (error) {
    logger.error("Get profile projects error:", error);
    res.status(500).json({ error: "Failed to load profile projects" });
  }
}

export async function unfollow(req: Request, res: Response): Promise<void> {
  const handle = (req.params.handle ?? "").trim().toLowerCase();
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!handle) {
    res.status(400).json({ error: "Handle is required" });
    return;
  }
  if (!HANDLE_REGEX.test(handle)) {
    res.status(400).json({ error: "Invalid handle format" });
    return;
  }

  try {
    await unfollowService(userId, handle);
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error("Unfollow error:", error);
    res.status(500).json({ error: "Failed to unfollow" });
  }
}

/** Requires auth. Returns the current user's preferences. */
export async function getMyPreferences(req: Request, res: Response): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const user = await UserModel.findById(userId).select("autoAcceptInvitations plan").lean();
    const autoAcceptInvitations = user?.autoAcceptInvitations !== false;
    const plan = user?.plan === "pro" ? "pro" : "free";
    res.status(200).json({ autoAcceptInvitations, plan });
  } catch (error) {
    logger.error("Get my preferences error:", error);
    res.status(500).json({ error: "Failed to load preferences" });
  }
}

/** Requires auth. Returns credits for the user. When workspaceId query param is provided and workspace is Pro, returns workspace-shared credits. */
export async function getMyCredits(req: Request, res: Response): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const workspaceId = typeof req.query?.workspaceId === "string" ? req.query.workspaceId : undefined;
  try {
    const credits = await getCredits(userId, workspaceId);
    res.status(200).json(credits);
  } catch (error) {
    logger.error("Get my credits error:", error);
    res.status(500).json({ error: "Failed to load credits" });
  }
}
