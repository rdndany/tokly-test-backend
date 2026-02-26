import { Request, Response } from "express";
import { HTTPSTATUS } from "../config/http.config";
import * as AdminService from "../services/adminService";
import type { AdminReferralStats } from "../services/adminService";
import { getTokenUpdateLogs, clearTokenUpdateLogs } from "../services/tokenUpdateLogService";
import { refreshProjectTokenDetailsForAdmin } from "../services/projectService";
import { createLogger } from "../utils/logger";
import * as AnnouncementService from "../services/announcementService";

const logger = createLogger("AdminController");

export async function getDashboardStats(req: Request, res: Response): Promise<void> {
  try {
    const stats = await AdminService.getDashboardStats();
    res.status(HTTPSTATUS.OK).json(stats);
  } catch (error) {
    logger.error("Error fetching dashboard stats", error);
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
      message: "Failed to fetch dashboard statistics",
    });
  }
}

export async function getRevenueAnalytics(req: Request, res: Response): Promise<void> {
  try {
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const analytics = await AdminService.getRevenueAnalytics(startDate, endDate);
    res.status(HTTPSTATUS.OK).json(analytics);
  } catch (error) {
    logger.error("Error fetching revenue analytics", error);
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
      message: "Failed to fetch revenue analytics",
    });
  }
}

export async function getUsers(req: Request, res: Response): Promise<void> {
  try {
    const search = (req.query.q as string) || undefined;
    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const result = await AdminService.getUsers({ search, page, limit });
    res.status(HTTPSTATUS.OK).json(result);
  } catch (error) {
    logger.error("Error fetching users", error);
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
      message: "Failed to fetch users",
    });
  }
}

export async function getWorkspaces(req: Request, res: Response): Promise<void> {
  try {
    const search = (req.query.q as string) || undefined;
    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const result = await AdminService.getWorkspaces({ search, page, limit });
    res.status(HTTPSTATUS.OK).json(result);
  } catch (error) {
    logger.error("Error fetching workspaces", error);
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
      message: "Failed to fetch workspaces",
    });
  }
}

export async function getProjects(req: Request, res: Response): Promise<void> {
  try {
    const search = (req.query.q as string) || undefined;
    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const result = await AdminService.getProjects({ search, page, limit });
    res.status(HTTPSTATUS.OK).json(result);
  } catch (error) {
    logger.error("Error fetching projects", error);
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
      message: "Failed to fetch projects",
    });
  }
}

export async function getWorkspaceById(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId;
    if (!workspaceId) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "Invalid workspaceId" });
      return;
    }
    const workspace = await AdminService.getWorkspaceById(workspaceId);
    if (!workspace) {
      res.status(HTTPSTATUS.NOT_FOUND).json({ message: "Workspace not found" });
      return;
    }
    res.status(HTTPSTATUS.OK).json(workspace);
  } catch (error) {
    logger.error("Error fetching workspace", error);
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
      message: "Failed to fetch workspace",
    });
  }
}

export async function patchWorkspace(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId;
    if (!workspaceId) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "Invalid workspaceId" });
      return;
    }
    const body = req.body as {
      planStatus?: "free" | "pro";
      proCreditsPerMonth?: number;
      addCredits?: number;
    };
    const planStatus = body.planStatus;
    const proCreditsPerMonth =
      typeof body.proCreditsPerMonth === "number" ? body.proCreditsPerMonth : undefined;
    const addCredits = typeof body.addCredits === "number" ? body.addCredits : undefined;

    if (addCredits !== undefined && (addCredits < 0 || !Number.isInteger(addCredits))) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "addCredits must be a non-negative integer" });
      return;
    }
    if (proCreditsPerMonth !== undefined && (proCreditsPerMonth < 0 || !Number.isInteger(proCreditsPerMonth))) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "proCreditsPerMonth must be a non-negative integer" });
      return;
    }

    const workspace = await AdminService.updateWorkspaceById(workspaceId, {
      planStatus,
      proCreditsPerMonth,
      addCredits,
    });
    if (!workspace) {
      res.status(HTTPSTATUS.NOT_FOUND).json({ message: "Workspace not found" });
      return;
    }
    res.status(HTTPSTATUS.OK).json(workspace);
  } catch (error) {
    logger.error("Error updating workspace", error);
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
      message: "Failed to update workspace",
    });
  }
}

export async function getProjectById(req: Request, res: Response): Promise<void> {
  try {
    const projectId = req.params.projectId;
    if (!projectId) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "Invalid projectId" });
      return;
    }
    const project = await AdminService.getProjectById(projectId);
    if (!project) {
      res.status(HTTPSTATUS.NOT_FOUND).json({ message: "Project not found" });
      return;
    }
    res.status(HTTPSTATUS.OK).json(project);
  } catch (error) {
    logger.error("Error fetching project", error);
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
      message: "Failed to fetch project",
    });
  }
}

export async function getUserById(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.params.userId;
    if (!userId) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "Invalid userId" });
      return;
    }
    const user = await AdminService.getUserById(userId);
    if (!user) {
      res.status(HTTPSTATUS.NOT_FOUND).json({ message: "User not found" });
      return;
    }
    res.status(HTTPSTATUS.OK).json(user);
  } catch (error) {
    logger.error("Error fetching user", error);
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
      message: "Failed to fetch user",
    });
  }
}

export async function updateUserRole(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.params.userId;
    const role = req.body?.role as "user" | "admin" | undefined;
    if (!userId || !role || (role !== "user" && role !== "admin")) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "Invalid userId or role" });
      return;
    }
    await AdminService.updateUserRole(userId, role);
    res.status(HTTPSTATUS.OK).json({ success: true });
  } catch (error) {
    logger.error("Error updating user role", error);
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
      message: "Failed to update user role",
    });
  }
}

export async function removeUser(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.params.userId;
    if (!userId) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "Invalid userId" });
      return;
    }
    await AdminService.removeUser(userId);
    res.status(HTTPSTATUS.OK).json({ success: true });
  } catch (error) {
    logger.error("Error removing user", error);
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
      message: "Failed to remove user",
    });
  }
}

export async function getTokenUpdateLogsHandler(req: Request, res: Response): Promise<void> {
  try {
    const limit = req.query.limit ? Math.min(Number(req.query.limit), 500) : 100;
    const logs = getTokenUpdateLogs(limit);
    res.status(HTTPSTATUS.OK).json(logs);
  } catch (error) {
    logger.error("Error fetching token update logs", error);
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
      message: "Failed to fetch token update logs",
    });
  }
}

export async function deleteTokenUpdateLogsHandler(req: Request, res: Response): Promise<void> {
  try {
    clearTokenUpdateLogs();
    res.status(HTTPSTATUS.OK).json({ success: true });
  } catch (error) {
    logger.error("Error clearing token update logs", error);
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
      message: "Failed to clear token update logs",
    });
  }
}

export async function refreshProjectTokenDetailsHandler(req: Request, res: Response): Promise<void> {
  try {
    const projectId = req.params.projectId;
    if (!projectId) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "Invalid projectId" });
      return;
    }
    const result = await refreshProjectTokenDetailsForAdmin(projectId);
    if (!result.success) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ success: false, error: result.error });
      return;
    }
    res.status(HTTPSTATUS.OK).json({ success: true, tokenDetails: result.tokenDetails });
  } catch (error) {
    logger.error("Error refreshing project token details", error);
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
      message: "Failed to refresh token details",
    });
  }
}

export async function getAdminReferralStatsHandler(req: Request, res: Response): Promise<void> {
  try {
    const stats: AdminReferralStats = await AdminService.getAdminReferralStats();
    res.status(HTTPSTATUS.OK).json({ success: true, stats });
  } catch (error) {
    logger.error("Error fetching admin referral stats", error);
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
      message: "Failed to fetch referral statistics",
    });
  }
}

export async function getAllReferralUsersHandler(req: Request, res: Response): Promise<void> {
  try {
    const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
    const search = (req.query.search as string) || undefined;
    const result = await AdminService.getAllReferralUsers(page, limit, search);
    res.status(HTTPSTATUS.OK).json({
      success: true,
      users: result.users,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error("Error fetching referral users", error);
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({
      message: "Failed to fetch referral users",
    });
  }
}

export async function getAllWithdrawalRequestsHandler(req: Request, res: Response): Promise<void> {
  try {
    const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
    const status = (req.query.status as string) || undefined;
    const search = (req.query.search as string) || undefined;
    const result = await AdminService.getAllWithdrawalRequests(page, limit, status, search);
    res.status(HTTPSTATUS.OK).json({ success: true, ...result });
  } catch (error) {
    logger.error("Error fetching withdrawal requests", error);
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({ message: "Failed to fetch withdrawal requests" });
  }
}

export async function approveWithdrawalRequestHandler(req: Request, res: Response): Promise<void> {
  try {
    const adminUserId = req.auth?.userId;
    if (!adminUserId) {
      res.status(HTTPSTATUS.UNAUTHORIZED).json({ message: "Unauthorized" });
      return;
    }
    const requestId = req.params.requestId;
    const { transactionHash, adminNotes } = req.body as { transactionHash?: string; adminNotes?: string };
    if (!requestId || !transactionHash?.trim()) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "requestId and transactionHash are required" });
      return;
    }
    const request = await AdminService.approveWithdrawalRequest(requestId, adminUserId, transactionHash.trim(), adminNotes);
    res.status(HTTPSTATUS.OK).json({ success: true, message: "Withdrawal request approved", request });
  } catch (error) {
    logger.error("Error approving withdrawal request", error);
    const message = error instanceof Error ? error.message : "Failed to approve withdrawal request";
    res.status(HTTPSTATUS.BAD_REQUEST).json({ message });
  }
}

export async function rejectWithdrawalRequestHandler(req: Request, res: Response): Promise<void> {
  try {
    const adminUserId = req.auth?.userId;
    if (!adminUserId) {
      res.status(HTTPSTATUS.UNAUTHORIZED).json({ message: "Unauthorized" });
      return;
    }
    const requestId = req.params.requestId;
    const { adminNotes } = req.body as { adminNotes?: string };
    if (!requestId) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "requestId is required" });
      return;
    }
    const request = await AdminService.rejectWithdrawalRequest(requestId, adminUserId, adminNotes);
    res.status(HTTPSTATUS.OK).json({ success: true, message: "Withdrawal request rejected", request });
  } catch (error) {
    logger.error("Error rejecting withdrawal request", error);
    const message = error instanceof Error ? error.message : "Failed to reject withdrawal request";
    res.status(HTTPSTATUS.BAD_REQUEST).json({ message });
  }
}

export async function getAnnouncementsHandler(req: Request, res: Response): Promise<void> {
  try {
    const list = await AnnouncementService.listAnnouncements();
    res.status(HTTPSTATUS.OK).json(list);
  } catch (error) {
    logger.error("Error fetching announcements", error);
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({ message: "Failed to fetch announcements" });
  }
}

export async function createAnnouncementHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as AnnouncementService.AnnouncementPayload;
    if (!body?.message?.trim()) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "message is required" });
      return;
    }
    const created = await AnnouncementService.createAnnouncement({
      message: body.message.trim(),
      linkText: body.linkText?.trim(),
      linkHref: body.linkHref?.trim(),
      variant: body.variant,
      active: body.active,
    });
    res.status(HTTPSTATUS.CREATED).json(created);
  } catch (error) {
    logger.error("Error creating announcement", error);
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({ message: "Failed to create announcement" });
  }
}

export async function updateAnnouncementHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id;
    const body = req.body as Partial<AnnouncementService.AnnouncementPayload>;
    if (!id) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "id is required" });
      return;
    }
    const payload: Partial<AnnouncementService.AnnouncementPayload> = {};
    if (body.message !== undefined) payload.message = body.message.trim();
    if (body.linkText !== undefined) payload.linkText = body.linkText?.trim() || undefined;
    if (body.linkHref !== undefined) payload.linkHref = body.linkHref?.trim() || undefined;
    if (body.variant !== undefined) payload.variant = body.variant;
    if (body.active !== undefined) payload.active = body.active;
    const updated = await AnnouncementService.updateAnnouncement(id, payload);
    if (!updated) {
      res.status(HTTPSTATUS.NOT_FOUND).json({ message: "Announcement not found" });
      return;
    }
    res.status(HTTPSTATUS.OK).json(updated);
  } catch (error) {
    logger.error("Error updating announcement", error);
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({ message: "Failed to update announcement" });
  }
}

export async function deleteAnnouncementHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(HTTPSTATUS.BAD_REQUEST).json({ message: "id is required" });
      return;
    }
    const deleted = await AnnouncementService.deleteAnnouncement(id);
    if (!deleted) {
      res.status(HTTPSTATUS.NOT_FOUND).json({ message: "Announcement not found" });
      return;
    }
    res.status(HTTPSTATUS.OK).json({ success: true });
  } catch (error) {
    logger.error("Error deleting announcement", error);
    res.status(HTTPSTATUS.INTERNAL_SERVER_ERROR).json({ message: "Failed to delete announcement" });
  }
}
