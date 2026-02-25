import type { PipelineStage } from "mongoose";
import UserModel from "../models/User";
import ProjectModel from "../models/Project";
import ProjectFolderModel from "../models/ProjectFolder";
import PaymentModel from "../models/Payment";
import WorkspaceModel from "../models/Workspace";
import ReferralModel from "../models/Referral";
import WithdrawalRequestModel from "../models/WithdrawalRequest";
import WorkspaceMemberModel from "../models/WorkspaceMember";
import { clerkClient } from "@clerk/express";
import { deleteUserData } from "./deleteUserDataService";
import {
  fetchStripeChargeSummary,
  fetchStripeActiveSubscriptionCount,
} from "./stripeRevenueService";
import { PRO_FLEX_CREDITS_DEFAULT } from "../config/planLimits";
import type { WorkspacePlanStatus } from "../models/Workspace";

export interface AdminDashboardStats {
  users: { totalUsers: number };
  projects: {
    totalProjects: number;
    totalProjectsWithSubscriptions?: number;
  };
  payments: {
    totalRevenue: number;
    totalPayments: number;
  };
  last5Users: Array<{
    id: string;
    name: string;
    email?: string;
    createdAt: string;
  }>;
  last5Projects: Array<{
    id: string;
    title: string;
    userId: string;
    userName: string;
    createdAt: string;
  }>;
}

export interface MonthlyRevenueData {
  month: string;
  revenue: number;
  formatted?: string;
}

export interface RevenueAnalytics {
  monthlyData: MonthlyRevenueData[];
  totalRevenue: number;
  averageMonthly: number;
  currentMonth: number;
  lastMonth: number;
}

/** Build daily series for [startDate, endDate] with 0 for days that have no revenue. */
function fillDailyRevenueRange(
  startDate: string,
  endDate: string,
  dailyData: { dateIso: string; label: string; revenue: number }[]
): MonthlyRevenueData[] {
  const revenueByDay = new Map(
    dailyData.map((d) => [d.dateIso, d.revenue])
  );
  const start = new Date(startDate + "T00:00:00.000Z");
  const end = new Date(endDate + "T00:00:00.000Z");
  const result: MonthlyRevenueData[] = [];
  const cur = new Date(start);

  while (cur.getTime() <= end.getTime()) {
    const iso = cur.toISOString().slice(0, 10);
    const label = cur.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year:
        cur.getUTCFullYear() !== new Date().getFullYear() ? "2-digit" : undefined,
    });
    const revenue = Math.round((revenueByDay.get(iso) ?? 0) * 100) / 100;
    result.push({
      month: label,
      revenue,
      formatted: `$${revenue.toFixed(2)}`,
    });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return result;
}

/**
 * Dashboard stats for admin. Payments and revenue: from Stripe API when configured, else from Payment model.
 * Includes last 5 users registered and last 5 projects created.
 */
export async function getDashboardStats(): Promise<AdminDashboardStats> {
  const [
    totalUsers,
    totalProjects,
    workspaceProCount,
    stripeActiveSubs,
    stripeSummary,
    dbPayments,
    dbRevenue,
    last5UsersRaw,
    last5ProjectsRaw,
  ] = await Promise.all([
    UserModel.countDocuments(),
    ProjectModel.countDocuments(),
    WorkspaceModel.countDocuments({ planStatus: "pro" }),
    fetchStripeActiveSubscriptionCount(),
    fetchStripeChargeSummary(),
    PaymentModel.countDocuments(),
    PaymentModel.aggregate([
      { $match: {} },
      { $group: { _id: null, total: { $sum: "$priceAmount" } } },
    ]).then((r) => (r[0]?.total ?? 0) as number),
    UserModel.find().sort({ createdAt: -1 }).limit(5).select("_id name email createdAt").lean(),
    ProjectModel.find().sort({ createdAt: -1 }).limit(5).select("_id title userId createdAt").lean(),
  ]);

  const totalRevenue = stripeSummary?.totalRevenueUsd ?? dbRevenue;
  const totalPayments = stripeSummary?.totalPayments ?? dbPayments;
  const totalProjectsWithSubscriptions = stripeActiveSubs ?? workspaceProCount;

  const projectUserIds = [...new Set((last5ProjectsRaw as { userId: string }[]).map((p) => p.userId))];
  const projectUsers = await UserModel.find({ _id: { $in: projectUserIds } })
    .select("_id name")
    .lean();
  const userNamesById = new Map(projectUsers.map((u) => [u._id, u.name ?? "—"]));

  const last5Users = (last5UsersRaw as Record<string, unknown>[]).map((u) => ({
    id: String(u._id),
    name: (u.name as string) ?? "—",
    email: u.email as string | undefined,
    createdAt: (u.createdAt as Date) ? new Date(u.createdAt as Date).toISOString() : "",
  }));

  const last5Projects = (last5ProjectsRaw as Record<string, unknown>[]).map((p) => ({
    id: String(p._id),
    title: (p.title as string) ?? "Untitled",
    userId: (p.userId as string) ?? "",
    userName: userNamesById.get(p.userId as string) ?? "—",
    createdAt: (p.createdAt as Date) ? new Date(p.createdAt as Date).toISOString() : "",
  }));

  return {
    users: { totalUsers },
    projects: {
      totalProjects,
      totalProjectsWithSubscriptions,
    },
    payments: {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalPayments,
    },
    last5Users,
    last5Projects,
  };
}

/**
 * Revenue analytics for date range. Uses Stripe Charges API when configured, else Payment model.
 */
export async function getRevenueAnalytics(
  startDate?: string,
  endDate?: string
): Promise<RevenueAnalytics> {
  const stripeSummary = await fetchStripeChargeSummary({
    startDate,
    endDate,
  });

  if (stripeSummary) {
    const dailyForFill = stripeSummary.byDay.map((d) => ({
      dateIso: d.dateIso,
      label: d.label,
      revenue: d.revenueUsd,
    }));
    const monthlyData: MonthlyRevenueData[] =
      startDate && endDate
        ? fillDailyRevenueRange(startDate, endDate, dailyForFill)
        : stripeSummary.byDay.map(({ label, revenueUsd }) => ({
            month: label,
            revenue: revenueUsd,
            formatted: `$${revenueUsd.toFixed(2)}`,
          }));
    const totalRevenue = stripeSummary.totalRevenueUsd;
    const averageMonthly =
      monthlyData.length > 0 ? totalRevenue / monthlyData.length : 0;

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    let currentMonth = 0;
    let lastMonth = 0;
    for (const day of stripeSummary.byDay) {
      const d = new Date(day.dateIso);
      const t = d.getTime();
      if (t >= currentMonthStart.getTime()) currentMonth += day.revenueUsd;
      if (t >= lastMonthStart.getTime() && t <= lastMonthEnd.getTime()) lastMonth += day.revenueUsd;
    }

    return {
      monthlyData,
      totalRevenue,
      averageMonthly: Math.round(averageMonthly * 100) / 100,
      currentMonth: Math.round(currentMonth * 100) / 100,
      lastMonth: Math.round(lastMonth * 100) / 100,
    };
  }

  // Fallback: Payment model
  const dateFilter: Record<string, unknown> = {};
  if (startDate || endDate) {
    dateFilter.createdAt = {};
    if (startDate) {
      (dateFilter.createdAt as Record<string, Date>).$gte = new Date(startDate);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setUTCDate(end.getUTCDate() + 1);
      (dateFilter.createdAt as Record<string, Date>).$lt = end;
    }
  }

  const payments = await PaymentModel.find(dateFilter)
    .sort({ createdAt: 1 })
    .select("priceAmount createdAt")
    .lean();

  const byDay: { iso: string; label: string; revenue: number }[] = [];
  const seen = new Map<string, number>();

  for (const p of payments) {
    const d = new Date(p.createdAt);
    const iso = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: d.getFullYear() !== new Date().getFullYear() ? "2-digit" : undefined,
    });

    const idx = seen.get(iso);
    const amount = p.priceAmount ?? 0;
    if (idx !== undefined) {
      byDay[idx].revenue += amount;
    } else {
      seen.set(iso, byDay.length);
      byDay.push({ iso, label, revenue: amount });
    }
  }

  byDay.sort((a, b) => a.iso.localeCompare(b.iso));

  const dailyForFill = byDay.map((d) => ({
    dateIso: d.iso,
    label: d.label,
    revenue: d.revenue,
  }));
  const monthlyData: MonthlyRevenueData[] =
    startDate && endDate
      ? fillDailyRevenueRange(startDate, endDate, dailyForFill)
      : byDay.map(({ label, revenue }) => ({
          month: label,
          revenue: Math.round(revenue * 100) / 100,
          formatted: `$${revenue.toFixed(2)}`,
        }));

  const totalRevenue = payments.reduce((sum, p) => sum + (p.priceAmount ?? 0), 0);
  const averageMonthly =
    monthlyData.length > 0 ? totalRevenue / monthlyData.length : 0;

  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  const currentMonth = payments
    .filter((p) => new Date(p.createdAt) >= currentMonthStart)
    .reduce((sum, p) => sum + (p.priceAmount ?? 0), 0);

  const lastMonth = payments
    .filter((p) => {
      const t = new Date(p.createdAt).getTime();
      return t >= lastMonthStart.getTime() && t <= lastMonthEnd.getTime();
    })
    .reduce((sum, p) => sum + (p.priceAmount ?? 0), 0);

  return {
    monthlyData,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    averageMonthly: Math.round(averageMonthly * 100) / 100,
    currentMonth: Math.round(currentMonth * 100) / 100,
    lastMonth: Math.round(lastMonth * 100) / 100,
  };
}

export interface AdminUserListItem {
  id: string;
  email?: string;
  name: string;
  image?: string;
  role: string;
  workspaces: number;
  projects: number;
  subscriptions: number;
  totalPaid: number;
  createdAt: string;
}

export interface AdminUserDetail {
  id: string;
  email?: string;
  name: string;
  image?: string;
  role: string;
  createdAt: string;
  workspaces: Array<{
    id: string;
    name: string;
    planStatus?: string;
    role: string;
    createdAt: string;
    workspaceCreatedAt: string;
    memberCount: number;
    projectCount: number;
    members: Array<{
      id: string;
      name: string;
      email?: string;
      image?: string;
      role: string;
    }>;
  }>;
  projects: Array<{
    id: string;
    title: string;
    workspaceName?: string;
    createdAt: string;
  }>;
  subscriptionsCount: number;
  totalPaid: number;
  payments: Array<{
    id: string;
    amount: number;
    type: string;
    createdAt: string;
  }>;
}

const DEFAULT_PAGE_SIZE = 20;

/** Escape special regex chars for safe use in $regex. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface GetUsersResult {
  users: AdminUserListItem[];
  total: number;
}

export interface AdminProjectListItem {
  id: string;
  title: string;
  userId: string;
  userName: string;
  userEmail?: string;
  workspaceId?: string;
  workspaceName?: string;
  published: boolean;
  projectVisibility?: string;
  createdAt: string;
}

export interface GetProjectsResult {
  projects: AdminProjectListItem[];
  total: number;
}

export interface AdminWorkspaceListItem {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  ownerEmail?: string;
  planStatus?: string;
  memberCount: number;
  projectCount: number;
  createdAt: string;
}

export interface GetWorkspacesResult {
  workspaces: AdminWorkspaceListItem[];
  total: number;
}

export interface AdminWorkspaceDetail {
  id: string;
  name: string;
  avatar?: string;
  createdBy: string;
  planStatus?: string;
  stripeSubscriptionId?: string;
  proCreditsPerMonth?: number;
  stripeSubscriptionInterval?: string;
  topUpCreditsBalance?: number;
  topUpCreditsExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
  owner: {
    id: string;
    name: string;
    email?: string;
    image?: string;
  };
  members: Array<{
    id: string;
    userId: string;
    name: string;
    email?: string;
    image?: string;
    role: string;
    joinedAt: string;
  }>;
  projects: Array<{
    id: string;
    title: string;
    userId: string;
    userName: string;
    createdAt: string;
  }>;
  folders: Array<{
    id: string;
    name: string;
    type: "personal" | "workspace";
    userId: string;
    parentFolderId: string | null;
    projectCount: number;
    depth: number;
    createdAt: string;
    updatedAt: string;
  }>;
  memberCount: number;
  projectCount: number;
}

/**
 * Get full workspace details for admin.
 */
export async function getWorkspaceById(
  workspaceId: string
): Promise<AdminWorkspaceDetail | null> {
  const workspace = await WorkspaceModel.findById(workspaceId).lean();
  if (!workspace) return null;

  const workspaceIdObj = workspace._id;
  const [owner, memberships, projects, foldersRaw] = await Promise.all([
    UserModel.findById(workspace.createdBy)
      .select("_id name email image")
      .lean(),
    WorkspaceMemberModel.find({ workspaceId: workspaceIdObj })
      .sort({ createdAt: 1 })
      .lean(),
    ProjectModel.find({ workspaceId: workspaceIdObj })
      .sort({ createdAt: -1 })
      .select("_id title userId createdAt")
      .lean(),
    ProjectFolderModel.find({ workspaceId: workspaceIdObj })
      .sort({ name: 1 })
      .lean(),
  ]);

  const memberIds = memberships.map((m: { userId: string }) => m.userId);
  const projectUserIds = (projects as { userId: string }[]).map((p) => p.userId);
  const allUserIds = [...new Set([...memberIds, ...projectUserIds])];
  const users = await UserModel.find({ _id: { $in: allUserIds } })
    .select("_id name email image")
    .lean();
  const usersById = new Map(users.map((u) => [u._id, u]));

  const members = (memberships as Record<string, unknown>[]).map((m) => {
    const u = usersById.get(m.userId as string) as
      | { _id: string; name?: string; email?: string; image?: string }
      | undefined;
    return {
      id: (m._id as { toString?: () => string })?.toString?.() ?? "",
      userId: m.userId as string,
      name: u?.name ?? "—",
      email: u?.email,
      image: u?.image,
      role: (m.role as string) ?? "member",
      joinedAt: m.createdAt
        ? new Date(m.createdAt as Date).toISOString()
        : "",
    };
  });

  const projectsList = (projects as Record<string, unknown>[]).map((p) => {
    const u = usersById.get(p.userId as string) as { name?: string } | undefined;
    return {
      id: (p._id as { toString?: () => string })?.toString?.() ?? String(p._id),
      title: (p.title as string) ?? "Untitled",
      userId: (p.userId as string) ?? "",
      userName: u?.name ?? "—",
      createdAt: p.createdAt
        ? new Date(p.createdAt as Date).toISOString()
        : "",
    };
  });

  const folderIds = (foldersRaw as { _id: unknown }[]).map((f) => f._id);
  const projectCountsByFolder =
    folderIds.length > 0
      ? await ProjectModel.aggregate<{ _id: unknown; count: number }>([
          { $match: { folderId: { $in: folderIds } } },
          { $group: { _id: "$folderId", count: { $sum: 1 } } },
        ])
      : [];
  const countByFolderId = new Map(
    projectCountsByFolder.map((r) => [String(r._id), r.count])
  );

  const folderIdToDepth = new Map<string, number>();
  function getDepth(f: { _id: unknown; parentFolderId?: unknown }): number {
    const id = String(f._id);
    if (folderIdToDepth.has(id)) return folderIdToDepth.get(id)!;
    if (!f.parentFolderId) {
      folderIdToDepth.set(id, 0);
      return 0;
    }
    const parent = (foldersRaw as { _id: unknown; parentFolderId: unknown }[]).find(
      (x) => String(x._id) === String(f.parentFolderId)
    );
    const d = parent ? getDepth(parent) + 1 : 0;
    folderIdToDepth.set(id, d);
    return d;
  }
  (foldersRaw as { _id: unknown; parentFolderId?: unknown }[]).forEach(getDepth);

  const foldersList = (foldersRaw as Record<string, unknown>[]).map((f) => {
    const id = (f._id as { toString?: () => string })?.toString?.() ?? String(f._id);
    return {
      id,
      name: (f.name as string) ?? "—",
      type: (f.type as "personal" | "workspace") ?? "workspace",
      userId: (f.userId as string) ?? "",
      parentFolderId: f.parentFolderId
        ? String(f.parentFolderId)
        : null,
      projectCount: countByFolderId.get(id) ?? 0,
      depth: folderIdToDepth.get(id) ?? 0,
      createdAt: f.createdAt ? new Date(f.createdAt as Date).toISOString() : "",
      updatedAt: f.updatedAt ? new Date(f.updatedAt as Date).toISOString() : "",
    };
  });

  return {
    id: (workspace._id as { toString: () => string }).toString(),
    name: workspace.name ?? "—",
    avatar: workspace.avatar,
    createdBy: workspace.createdBy as string,
    planStatus: workspace.planStatus,
    stripeSubscriptionId: workspace.stripeSubscriptionId,
    proCreditsPerMonth: workspace.proCreditsPerMonth,
    stripeSubscriptionInterval: workspace.stripeSubscriptionInterval,
    topUpCreditsBalance: workspace.topUpCreditsBalance,
    topUpCreditsExpiresAt: workspace.topUpCreditsExpiresAt
      ? new Date(workspace.topUpCreditsExpiresAt).toISOString()
      : undefined,
    createdAt: (workspace.createdAt as Date).toISOString(),
    updatedAt: (workspace.updatedAt as Date).toISOString(),
    owner: {
      id: owner?._id ?? workspace.createdBy,
      name: owner?.name ?? "—",
      email: owner?.email,
      image: owner?.image,
    },
    members,
    projects: projectsList,
    folders: foldersList,
    memberCount: members.length,
    projectCount: projectsList.length,
  };
}

export interface AdminUpdateWorkspaceInput {
  /** Set plan to "pro" or "free". */
  planStatus?: WorkspacePlanStatus;
  /** Pro subscription credits per month (used when planStatus is "pro"). Default 100. */
  proCreditsPerMonth?: number;
  /** Add this many credits to top-up balance. Expiry extended to 12 months from now. */
  addCredits?: number;
}

/**
 * Admin: update workspace plan and/or add credits.
 */
export async function updateWorkspaceById(
  workspaceId: string,
  input: AdminUpdateWorkspaceInput
): Promise<AdminWorkspaceDetail | null> {
  const workspace = await WorkspaceModel.findById(workspaceId);
  if (!workspace) return null;

  const updates: Record<string, unknown> = {};

  if (input.planStatus !== undefined) {
    updates.planStatus = input.planStatus;
    if (input.planStatus === "pro") {
      updates.proCreditsPerMonth =
        input.proCreditsPerMonth ?? workspace.proCreditsPerMonth ?? PRO_FLEX_CREDITS_DEFAULT;
      // Admin grant: leave stripeSubscriptionId as-is if already set; otherwise leave unset
    } else if (input.planStatus === "free") {
      updates.stripeSubscriptionId = undefined;
      updates.stripeSubscriptionInterval = undefined;
      updates.proCreditsPerMonth = undefined;
    }
  } else if (input.proCreditsPerMonth !== undefined && workspace.planStatus === "pro") {
    updates.proCreditsPerMonth = input.proCreditsPerMonth;
  }

  if (input.addCredits !== undefined && input.addCredits > 0) {
    const current = workspace.topUpCreditsBalance ?? 0;
    updates.topUpCreditsBalance = current + input.addCredits;
    const twelveMonthsFromNow = new Date();
    twelveMonthsFromNow.setUTCMonth(twelveMonthsFromNow.getUTCMonth() + 12);
    const existingExpiry = workspace.topUpCreditsExpiresAt
      ? new Date(workspace.topUpCreditsExpiresAt)
      : null;
    updates.topUpCreditsExpiresAt =
      existingExpiry && existingExpiry > twelveMonthsFromNow
        ? existingExpiry
        : twelveMonthsFromNow;
  }

  if (Object.keys(updates).length === 0) return getWorkspaceById(workspaceId);

  await WorkspaceModel.updateOne(
    { _id: workspace._id },
    { $set: updates }
  );

  return getWorkspaceById(workspaceId);
}

/**
 * List workspaces for admin with search and pagination.
 */
export async function getWorkspaces(options?: {
  search?: string;
  page?: number;
  limit?: number;
}): Promise<GetWorkspacesResult> {
  const page = Math.max(1, options?.page ?? 1);
  const limit = Math.min(100, Math.max(1, options?.limit ?? DEFAULT_PAGE_SIZE));
  const skip = (page - 1) * limit;
  const q = options?.search?.trim();

  const pipeline: PipelineStage[] = [
    { $lookup: { from: "users", localField: "createdBy", foreignField: "_id", as: "ownerDoc" } },
    { $unwind: { path: "$ownerDoc", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "workspacemembers",
        localField: "_id",
        foreignField: "workspaceId",
        as: "members",
      },
    },
    {
      $lookup: {
        from: "projects",
        localField: "_id",
        foreignField: "workspaceId",
        as: "projects",
      },
    },
    {
      $addFields: {
        ownerName: { $ifNull: ["$ownerDoc.name", "—"] },
        ownerEmail: "$ownerDoc.email",
        memberCount: { $size: "$members" },
        projectCount: { $size: "$projects" },
      },
    },
  ];

  if (q) {
    const escaped = escapeRegex(q);
    const re = new RegExp(escaped, "i");
    pipeline.push({
      $match: {
        $or: [
          { name: { $regex: re } },
          { ownerName: { $regex: re } },
          { ownerEmail: { $regex: re } },
        ],
      },
    } as PipelineStage);
  }

  const [result] = await WorkspaceModel.aggregate<{
    workspaces: AdminWorkspaceListItem[];
    total: Array<{ count: number }>;
  }>([
    ...pipeline,
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        workspaces: [
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              id: { $toString: "$_id" },
              name: 1,
              ownerId: "$createdBy",
              ownerName: 1,
              ownerEmail: 1,
              planStatus: 1,
              memberCount: 1,
              projectCount: 1,
              createdAt: { $dateToString: { date: "$createdAt" } },
            },
          },
        ],
        total: [{ $count: "count" }],
      },
    },
  ]);

  const workspaces = result?.workspaces ?? [];
  const total = result?.total?.[0]?.count ?? 0;

  return { workspaces, total };
}

/**
 * List projects for admin with search and pagination.
 */
export async function getProjects(options?: {
  search?: string;
  page?: number;
  limit?: number;
}): Promise<GetProjectsResult> {
  const page = Math.max(1, options?.page ?? 1);
  const limit = Math.min(100, Math.max(1, options?.limit ?? DEFAULT_PAGE_SIZE));
  const skip = (page - 1) * limit;
  const q = options?.search?.trim();

  const pipeline: PipelineStage[] = [
    { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "userDoc" } },
    { $unwind: { path: "$userDoc", preserveNullAndEmptyArrays: true } },
    { $lookup: { from: "workspaces", localField: "workspaceId", foreignField: "_id", as: "wsDoc" } },
    { $unwind: { path: "$wsDoc", preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        userName: { $ifNull: ["$userDoc.name", "—"] },
        userEmail: "$userDoc.email",
        workspaceName: { $ifNull: ["$wsDoc.name", "—"] },
      },
    },
  ];

  if (q) {
    const escaped = escapeRegex(q);
    const re = new RegExp(escaped, "i");
    pipeline.push({
      $match: {
        $or: [
          { title: { $regex: re } },
          { userName: { $regex: re } },
          { userEmail: { $regex: re } },
          { workspaceName: { $regex: re } },
        ],
      },
    } as PipelineStage);
  }

  const [result] = await ProjectModel.aggregate<{
    projects: AdminProjectListItem[];
    total: Array<{ count: number }>;
  }>([
    ...pipeline,
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        projects: [
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              id: { $toString: "$_id" },
              title: { $ifNull: ["$title", "Untitled"] },
              userId: "$userId",
              userName: 1,
              userEmail: 1,
              workspaceId: { $ifNull: [{ $toString: "$workspaceId" }, null] },
              workspaceName: 1,
              published: { $ifNull: ["$published", false] },
              projectVisibility: 1,
              createdAt: { $dateToString: { date: "$createdAt" } },
            },
          },
        ],
        total: [{ $count: "count" }],
      },
    },
  ]);

  const projects = result?.projects ?? [];
  const total = result?.total?.[0]?.count ?? 0;

  return { projects, total };
}

/**
 * Get full project details for admin (owner, workspace info).
 */
export async function getProjectById(projectId: string) {
  const { getProjectById: getProject } = await import("../services/projectService");
  const project = await getProject(projectId);
  if (!project) return null;

  const [owner, workspace] = await Promise.all([
    UserModel.findById(project.userId).select("_id name email image").lean(),
    project.workspaceId
      ? WorkspaceModel.findById(project.workspaceId).select("_id name planStatus").lean()
      : null,
  ]);

  return {
    ...project,
    owner: owner
      ? { id: owner._id, name: owner.name ?? "—", email: owner.email, image: owner.image }
      : { id: project.userId, name: "—", email: undefined, image: undefined },
    workspace: workspace
      ? {
          id: (workspace._id as { toString: () => string }).toString(),
          name: workspace.name ?? "—",
          planStatus: workspace.planStatus,
        }
      : null,
  };
}

/**
 * List users for admin with search and pagination. Includes workspace and project counts.
 */
export async function getUsers(options?: {
  search?: string;
  page?: number;
  limit?: number;
}): Promise<GetUsersResult> {
  const page = Math.max(1, options?.page ?? 1);
  const limit = Math.min(100, Math.max(1, options?.limit ?? DEFAULT_PAGE_SIZE));
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  const q = options?.search?.trim();
  if (q) {
    const escaped = escapeRegex(q);
    const re = new RegExp(escaped, "i");
    filter.$or = [
      { name: { $regex: re } },
      { email: { $regex: re } },
    ];
  }

  const [users, total] = await Promise.all([
    UserModel.find(filter).sort({ createdAt: 1 }).skip(skip).limit(limit).lean(),
    UserModel.countDocuments(filter),
  ]);
  const userIds = users.map((u) => u._id);

  const [workspaceCounts, projectCounts, subscriptionCounts, paymentTotals] =
    await Promise.all([
      WorkspaceMemberModel.aggregate<{ _id: string; count: number }>([
        { $match: { userId: { $in: userIds } } },
        { $group: { _id: "$userId", count: { $addToSet: "$workspaceId" } } },
        { $project: { _id: 1, count: { $size: "$count" } } },
      ]),
      ProjectModel.aggregate<{ _id: string; count: number }>([
        { $match: { userId: { $in: userIds } } },
        { $group: { _id: "$userId", count: { $sum: 1 } } },
      ]),
      WorkspaceMemberModel.aggregate<{ _id: string; count: number }>([
        { $match: { userId: { $in: userIds } } },
        { $lookup: { from: "workspaces", localField: "workspaceId", foreignField: "_id", as: "ws" } },
        { $unwind: "$ws" },
        { $match: { "ws.planStatus": "pro" } },
        { $group: { _id: "$userId", count: { $sum: 1 } } },
      ]),
      PaymentModel.aggregate<{ _id: string; total: number }>([
        { $match: { userId: { $in: userIds } } },
        { $group: { _id: "$userId", total: { $sum: "$priceAmount" } } },
      ]),
    ]);

  const wsMap = new Map(workspaceCounts.map((r) => [r._id, r.count]));
  const projMap = new Map(projectCounts.map((r) => [r._id, r.count]));
  const subMap = new Map(subscriptionCounts.map((r) => [r._id, r.count]));
  const paidMap = new Map(paymentTotals.map((r) => [r._id, r.total]));

  return {
    users: users.map((u) => ({
      id: u._id,
      email: u.email,
      name: u.name ?? "—",
      image: u.image,
      role: u.role ?? "user",
      workspaces: wsMap.get(u._id) ?? 0,
      projects: projMap.get(u._id) ?? 0,
      subscriptions: subMap.get(u._id) ?? 0,
      totalPaid: Math.round((paidMap.get(u._id) ?? 0) * 100) / 100,
      createdAt: (u.createdAt as Date).toISOString(),
    })),
    total,
  };
}

/**
 * Get full user details for admin (workspaces, projects, payments).
 */
export async function getUserById(userId: string): Promise<AdminUserDetail | null> {
  const user = await UserModel.findById(userId).lean();
  if (!user) return null;

  const [memberships, projects, payments] = await Promise.all([
    WorkspaceMemberModel.find({ userId }).populate("workspaceId").lean(),
    ProjectModel.find({ userId })
      .populate("workspaceId", "name")
      .sort({ createdAt: -1 })
      .lean(),
    PaymentModel.find({ userId }).sort({ createdAt: -1 }).lean(),
  ]);

  const workspaceIds = (memberships as Record<string, unknown>[]).map((m) => {
    const ws = m.workspaceId as { _id?: unknown } | null;
    return ws?._id;
  }).filter(Boolean);

  const [allMembersRaw, projectCounts] = await Promise.all([
    WorkspaceMemberModel.find({ workspaceId: { $in: workspaceIds } })
      .select("workspaceId userId role")
      .lean(),
    ProjectModel.aggregate<{ _id: unknown; count: number }>([
      { $match: { workspaceId: { $in: workspaceIds } } },
      { $group: { _id: "$workspaceId", count: { $sum: 1 } } },
    ]),
  ]);

  const memberIds = [...new Set((allMembersRaw as { userId: string }[]).map((m) => m.userId))];
  const usersList = await UserModel.find({ _id: { $in: memberIds } })
    .select("_id name email image")
    .lean();
  const usersById = new Map(usersList.map((u) => [u._id, u]));

  const projCountMap = new Map(projectCounts.map((r) => [String(r._id), r.count]));
  const membersByWs = new Map<string, { userId: string; role: string }[]>();
  for (const m of allMembersRaw as { workspaceId: { toString: () => string }; userId: string; role: string }[]) {
    const wsId = m.workspaceId?.toString?.() ?? String(m.workspaceId);
    if (!membersByWs.has(wsId)) membersByWs.set(wsId, []);
    membersByWs.get(wsId)!.push({ userId: m.userId, role: m.role ?? "member" });
  }

  const workspaces = (memberships as Record<string, unknown>[]).map((m) => {
    const ws = m.workspaceId as {
      _id?: { toString: () => string };
      name?: string;
      planStatus?: string;
      createdAt?: Date;
    } | null;
    const wsId = ws?._id?.toString?.() ?? "";
    const members = membersByWs.get(wsId) ?? [];
    return {
      id: wsId,
      name: ws?.name ?? "—",
      planStatus: ws?.planStatus,
      role: (m.role as string) ?? "member",
      createdAt: m.createdAt ? new Date(m.createdAt as Date).toISOString() : "",
      workspaceCreatedAt: ws?.createdAt ? new Date(ws.createdAt).toISOString() : "",
      memberCount: members.length,
      projectCount: projCountMap.get(wsId) ?? 0,
      members: members.slice(0, 10).map((mb) => {
        const u = usersById.get(mb.userId) as { _id: string; name?: string; email?: string; image?: string } | undefined;
        return {
          id: mb.userId,
          name: u?.name ?? "—",
          email: u?.email,
          image: u?.image,
          role: mb.role,
        };
      }),
    };
  });

  const projectsList = (projects as Record<string, unknown>[]).map((p) => {
    const ws = p.workspaceId as { name?: string } | null;
    return {
      id: (p._id as { toString?: () => string })?.toString?.() ?? String(p._id),
      title: (p.title as string) ?? "Untitled",
      workspaceName: ws?.name,
      createdAt: p.createdAt ? new Date(p.createdAt as Date).toISOString() : "",
    };
  });

  const paymentsList = (payments as Record<string, unknown>[]).map((p) => ({
    id: (p._id as { toString?: () => string })?.toString?.() ?? String(p._id),
    amount: Math.round(((p.priceAmount as number) ?? 0) * 100) / 100,
    type: (p.type as string) ?? "subscription",
    createdAt: p.createdAt ? new Date(p.createdAt as Date).toISOString() : "",
  }));

  const subscriptionsCount = workspaces.filter((w) => w.planStatus === "pro").length;
  const totalPaid = (payments as { priceAmount?: number }[]).reduce(
    (sum, p) => sum + (p.priceAmount ?? 0),
    0
  );

  return {
    id: user._id as string,
    email: user.email,
    name: user.name ?? "—",
    image: user.image,
    role: user.role ?? "user",
    createdAt: (user.createdAt as Date).toISOString(),
    workspaces,
    projects: projectsList,
    subscriptionsCount,
    totalPaid: Math.round(totalPaid * 100) / 100,
    payments: paymentsList,
  };
}

/**
 * Update a user's role (both in DB and Clerk metadata).
 * Updates Clerk first; if Clerk returns 404 (user not in Clerk), still updates DB and succeeds.
 */
export async function updateUserRole(
  userId: string,
  role: "user" | "admin"
): Promise<void> {
  try {
    await clerkClient.users.updateUserMetadata(userId, {
      publicMetadata: { role },
    });
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    if (status === 404) {
      // User exists in our DB but not in Clerk (deleted, different env, etc.)
      // Still update our DB so the admin table is correct
    } else {
      throw err;
    }
  }
  await UserModel.findByIdAndUpdate(userId, {
    role,
    updatedAt: new Date(),
  });
}

/**
 * Remove a user and all their data. Calls Clerk deleteUser (webhook cascades),
 * or deleteUserData directly if user not in Clerk.
 */
export async function removeUser(userId: string): Promise<void> {
  try {
    await clerkClient.users.deleteUser(userId);
    // Clerk webhook user.deleted will call deleteUserData
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    if (status === 404) {
      // User not in Clerk – delete from our DB directly
      await deleteUserData(userId);
    } else {
      throw err;
    }
  }
}

export interface AdminReferralStats {
  totalReferrers: number;
  totalReferrals: number;
  totalCommissions: number;
  totalWithdrawals: number;
  pendingWithdrawals: number;
  completedWithdrawals: number;
  totalWithdrawalAmount: number;
  pendingWithdrawalAmount: number;
}

export async function getAdminReferralStats(): Promise<AdminReferralStats> {
  const [totalReferrers, totalReferrals] = await Promise.all([
    UserModel.countDocuments({ affiliateCode: { $exists: true, $nin: [null, ""] } }),
    ReferralModel.countDocuments(),
  ]);
  return {
    totalReferrers,
    totalReferrals,
    totalCommissions: 0,
    totalWithdrawals: 0,
    pendingWithdrawals: 0,
    completedWithdrawals: 0,
    totalWithdrawalAmount: 0,
    pendingWithdrawalAmount: 0,
  };
}

export interface AdminReferralUserReferred {
  _id: string;
  name: string;
  email: string;
  createdAt: string;
  totalCommission: number;
}

export interface AdminReferralUser {
  _id: string;
  userId: string;
  affiliateCode: string;
  totalReferrals: number;
  totalCommissions: number;
  totalWithdrawals: number;
  pendingWithdrawals: number;
  availableBalance: number;
  lastWithdrawalDate?: string;
  createdAt: string;
  referredUsers: AdminReferralUserReferred[];
  user?: {
    _id: string;
    firstName?: string;
    lastName?: string;
    image?: string;
    emailAddresses: Array<{ emailAddress: string }>;
  };
}

export async function getAllReferralUsers(
  page: number = 1,
  limit: number = 20,
  search?: string
): Promise<{
  users: AdminReferralUser[];
  pagination: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean };
}> {
  const skip = (page - 1) * limit;
  const hasCode = { affiliateCode: { $exists: true, $nin: [null, ""] } };
  let filter: Record<string, unknown> = hasCode;
  if (search?.trim()) {
    const s = search.trim();
    filter = {
      $and: [
        hasCode,
        { $or: [
          { affiliateCode: new RegExp(s, "i") },
          { email: new RegExp(s, "i") },
          { name: new RegExp(s, "i") },
        ]},
      ],
    };
  }

  const total = await UserModel.countDocuments(filter);
  const users = await UserModel.find(filter)
    .select("_id name email image affiliateCode createdAt")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const usersWithStats: AdminReferralUser[] = await Promise.all(
    users.map(async (u) => {
      const totalReferrals = await ReferralModel.countDocuments({ referrerId: u._id });
      const referred = await ReferralModel.find({ referrerId: u._id }).limit(100).lean();
      const referredUsers = await Promise.all(
        referred.map(async (r) => {
          const refUser = await UserModel.findById(r.referredUserId).select("_id name email createdAt").lean();
          return {
            _id: (refUser?._id ?? r.referredUserId) as string,
            name: refUser?.name ?? "—",
            email: refUser?.email ?? "",
            createdAt: refUser?.createdAt ? new Date(refUser.createdAt).toISOString() : "",
            totalCommission: (r as { totalCommissionAmount?: number }).totalCommissionAmount ?? 0,
          };
        })
      );

      return {
        _id: u._id,
        userId: u._id,
        affiliateCode: (u as { affiliateCode?: string }).affiliateCode ?? "",
        totalReferrals,
        totalCommissions: 0,
        totalWithdrawals: 0,
        pendingWithdrawals: 0,
        availableBalance: 0,
        createdAt: (u as { createdAt?: Date }).createdAt ? new Date((u as { createdAt: Date }).createdAt).toISOString() : "",
        referredUsers,
        user: {
          _id: u._id,
          firstName: (u as { name?: string }).name ?? undefined,
          lastName: undefined,
          image: (u as { image?: string }).image ?? undefined,
          emailAddresses: (u as { email?: string }).email ? [{ emailAddress: (u as { email: string }).email }] : [],
        },
      };
    })
  );

  const totalPages = Math.ceil(total / limit);
  return {
    users: usersWithStats,
    pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
  };
}

export interface AdminWithdrawalRequestResult {
  _id: string;
  userId: string;
  amount: number;
  solanaWallet: string;
  status: string;
  transactionHash?: string;
  adminNotes?: string;
  processedBy?: string;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  user?: {
    _id: string;
    firstName?: string;
    emailAddresses: Array<{ emailAddress: string }>;
    affiliateCode?: string;
  };
}

export async function getAllWithdrawalRequests(
  page: number = 1,
  limit: number = 20,
  status?: string,
  search?: string
): Promise<{
  requests: AdminWithdrawalRequestResult[];
  pagination: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean };
}> {
  const skip = (page - 1) * limit;
  const query: Record<string, unknown> = {};
  if (status && status !== "all") query.status = status;
  if (search?.trim()) {
    query.$or = [
      { solanaWallet: new RegExp(search.trim(), "i") },
      { transactionHash: new RegExp(search.trim(), "i") },
      { adminNotes: new RegExp(search.trim(), "i") },
    ];
  }
  const total = await WithdrawalRequestModel.countDocuments(query);
  const list = await WithdrawalRequestModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
  const requests: AdminWithdrawalRequestResult[] = await Promise.all(
    list.map(async (r: unknown) => {
      const row = r as { _id: unknown; userId: string; amount: number; solanaWallet: string; status: string; transactionHash?: string; adminNotes?: string; processedBy?: string; processedAt?: Date; createdAt: Date; updatedAt: Date };
      const user = await UserModel.findById(row.userId).select("_id name email affiliateCode").lean();
      return {
        _id: String(row._id),
        userId: row.userId,
        amount: row.amount,
        solanaWallet: row.solanaWallet,
        status: row.status,
        transactionHash: row.transactionHash,
        adminNotes: row.adminNotes,
        processedBy: row.processedBy,
        processedAt: row.processedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        user: user
          ? {
              _id: String((user as { _id: string })._id),
              firstName: (user as { name?: string }).name,
              emailAddresses: (user as { email?: string }).email ? [{ emailAddress: (user as { email: string }).email }] : [],
              affiliateCode: (user as { affiliateCode?: string }).affiliateCode,
            }
          : undefined,
      };
    })
  );
  const totalPages = Math.ceil(total / limit);
  return {
    requests,
    pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
  };
}

export async function approveWithdrawalRequest(
  requestId: string,
  adminUserId: string,
  transactionHash: string,
  adminNotes?: string
): Promise<AdminWithdrawalRequestResult> {
  const doc = await WithdrawalRequestModel.findById(requestId);
  if (!doc) throw new Error("Withdrawal request not found");
  if (doc.status !== "pending") throw new Error("Withdrawal request is not pending");
  doc.status = "completed";
  doc.transactionHash = transactionHash.trim();
  doc.processedBy = adminUserId;
  doc.processedAt = new Date();
  if (adminNotes?.trim()) doc.adminNotes = adminNotes.trim();
  await doc.save();
  const user = await UserModel.findById(doc.userId).select("_id name email affiliateCode").lean();
  return {
    _id: String(doc._id),
    userId: doc.userId,
    amount: doc.amount,
    solanaWallet: doc.solanaWallet,
    status: doc.status,
    transactionHash: doc.transactionHash,
    adminNotes: doc.adminNotes,
    processedBy: doc.processedBy,
    processedAt: doc.processedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    user: user
      ? {
          _id: String((user as { _id: string })._id),
          firstName: (user as { name?: string }).name,
          emailAddresses: (user as { email?: string }).email ? [{ emailAddress: (user as { email: string }).email }] : [],
          affiliateCode: (user as { affiliateCode?: string }).affiliateCode,
        }
      : undefined,
  };
}

export async function rejectWithdrawalRequest(
  requestId: string,
  adminUserId: string,
  adminNotes?: string
): Promise<AdminWithdrawalRequestResult> {
  const doc = await WithdrawalRequestModel.findById(requestId);
  if (!doc) throw new Error("Withdrawal request not found");
  if (doc.status !== "pending") throw new Error("Withdrawal request is not pending");
  doc.status = "failed";
  doc.processedBy = adminUserId;
  doc.processedAt = new Date();
  if (adminNotes?.trim()) doc.adminNotes = adminNotes.trim();
  await doc.save();
  const user = await UserModel.findById(doc.userId).select("_id name email affiliateCode").lean();
  return {
    _id: String(doc._id),
    userId: doc.userId,
    amount: doc.amount,
    solanaWallet: doc.solanaWallet,
    status: doc.status,
    transactionHash: doc.transactionHash,
    adminNotes: doc.adminNotes,
    processedBy: doc.processedBy,
    processedAt: doc.processedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    user: user
      ? {
          _id: String((user as { _id: string })._id),
          firstName: (user as { name?: string }).name,
          emailAddresses: (user as { email?: string }).email ? [{ emailAddress: (user as { email: string }).email }] : [],
          affiliateCode: (user as { affiliateCode?: string }).affiliateCode,
        }
      : undefined,
  };
}
