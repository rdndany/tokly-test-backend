import { Router } from "express";
import { checkAdminAuth } from "../middlewares/adminAuth";
import {
  getDashboardStats,
  getRevenueAnalytics,
  getUsers,
  getUserById,
  getWorkspaces,
  getWorkspaceById,
  patchWorkspace,
  getProjects,
  getAdminAirdrops,
  getAdminWhitelists,
  getProjectById,
  updateUserRole,
  removeUser,
  getTokenUpdateLogsHandler,
  deleteTokenUpdateLogsHandler,
  refreshProjectTokenDetailsHandler,
  getAdminReferralStatsHandler,
  getAllReferralUsersHandler,
  getAllWithdrawalRequestsHandler,
  approveWithdrawalRequestHandler,
  rejectWithdrawalRequestHandler,
  getAnnouncementsHandler,
  createAnnouncementHandler,
  updateAnnouncementHandler,
  deleteAnnouncementHandler,
} from "../controllers/AdminController";

const router = Router();

router.get("/dashboard/stats", checkAdminAuth, getDashboardStats);
router.get("/dashboard/revenue-analytics", checkAdminAuth, getRevenueAnalytics);
router.get("/users", checkAdminAuth, getUsers);
router.get("/workspaces", checkAdminAuth, getWorkspaces);
router.get("/workspaces/:workspaceId", checkAdminAuth, getWorkspaceById);
router.patch("/workspaces/:workspaceId", checkAdminAuth, patchWorkspace);
router.get("/projects", checkAdminAuth, getProjects);
router.get("/airdrops", checkAdminAuth, getAdminAirdrops);
router.get("/whitelists", checkAdminAuth, getAdminWhitelists);
router.get("/projects/:projectId", checkAdminAuth, getProjectById);
router.post("/projects/:projectId/refresh-token-details", checkAdminAuth, refreshProjectTokenDetailsHandler);
router.get("/logs/token-updates", checkAdminAuth, getTokenUpdateLogsHandler);
router.delete("/logs/token-updates", checkAdminAuth, deleteTokenUpdateLogsHandler);
router.get("/referrals/stats", checkAdminAuth, getAdminReferralStatsHandler);
router.get("/referrals/users", checkAdminAuth, getAllReferralUsersHandler);
router.get("/referrals/withdrawals", checkAdminAuth, getAllWithdrawalRequestsHandler);
router.post("/referrals/withdrawals/:requestId/approve", checkAdminAuth, approveWithdrawalRequestHandler);
router.post("/referrals/withdrawals/:requestId/reject", checkAdminAuth, rejectWithdrawalRequestHandler);
router.get("/announcements", checkAdminAuth, getAnnouncementsHandler);
router.post("/announcements", checkAdminAuth, createAnnouncementHandler);
router.patch("/announcements/:id", checkAdminAuth, updateAnnouncementHandler);
router.delete("/announcements/:id", checkAdminAuth, deleteAnnouncementHandler);
router.get("/users/:userId", checkAdminAuth, getUserById);
router.patch("/users/:userId/role", checkAdminAuth, updateUserRole);
router.delete("/users/:userId", checkAdminAuth, removeUser);

export default router;
