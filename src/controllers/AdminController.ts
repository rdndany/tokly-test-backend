import { Request, Response } from "express";
import { HTTPSTATUS } from "../config/http.config";
import * as AdminService from "../services/adminService";
import type { AdminReferralStats } from "../services/adminService";
import { getTokenUpdateLogs, clearTokenUpdateLogs } from "../services/tokenUpdateLogService";
import { refreshProjectTokenDetailsForAdmin } from "../services/projectService";
import { createLogger } from "../utils/logger";

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
