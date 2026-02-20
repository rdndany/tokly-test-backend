import mongoose from "mongoose";
import UserDailyCreditsModel from "../models/UserDailyCredits";
import UserMonthlyCreditsModel from "../models/UserMonthlyCredits";
import WorkspaceMonthlyCreditsModel from "../models/WorkspaceMonthlyCredits";
import WorkspaceModel from "../models/Workspace";
import UserModel from "../models/User";
import type { PlanId } from "../models/User";
import { PLAN_LIMITS, PRO_FLEX_CREDITS_DEFAULT } from "../config/planLimits";

function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
}

function getCurrentMonthString(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM UTC
}

export interface CreditsInfo {
  remaining: number;
  usedToday: number;
  usedThisMonth: number;
  limit: number;
  plan: PlanId;
}

/** Get current user's plan (default 'free' if user not found). */
export async function getUserPlan(userId: string): Promise<PlanId> {
  const user = await UserModel.findById(userId).select("plan").lean();
  return user?.plan === "pro" ? "pro" : "free";
}

/** Get Pro flex credits limit from user (default from config). */
async function getProFlexLimit(userId: string): Promise<number> {
  const user = await UserModel.findById(userId).select("proCreditsPerMonth").lean();
  return user?.proCreditsPerMonth ?? PRO_FLEX_CREDITS_DEFAULT;
}

/**
 * Get credits for a user. When workspaceId is provided and workspace is Pro,
 * returns workspace-shared credits. Otherwise returns user credits.
 */
export async function getCredits(
  userId: string,
  workspaceId?: string
): Promise<CreditsInfo> {
  if (workspaceId) {
    const ws = await WorkspaceModel.findById(workspaceId)
      .select("planStatus proCreditsPerMonth")
      .lean();
    if (ws?.planStatus === "pro") {
      return getWorkspaceCredits(workspaceId, ws.proCreditsPerMonth ?? PRO_FLEX_CREDITS_DEFAULT);
    }
  }
  return getUserCredits(userId);
}

/** Get user-level credits (Free or legacy user Pro). */
async function getUserCredits(userId: string): Promise<CreditsInfo> {
  const date = getTodayDateString();
  const month = getCurrentMonthString();
  const plan = await getUserPlan(userId);
  const [dailyDoc, monthlyDoc] = await Promise.all([
    UserDailyCreditsModel.findOne({ userId, date }).lean(),
    UserMonthlyCreditsModel.findOne({ userId, month }).lean(),
  ]);

  const usedToday = dailyDoc?.creditsUsed ?? 0;
  const usedBaseMonth = monthlyDoc?.creditsUsed ?? 0;
  const flexUsed = monthlyDoc?.flexCreditsUsed ?? 0;

  if (plan === "free") {
    const limits = PLAN_LIMITS.free;
    const remainingDaily = Math.max(0, limits.creditsPerDay - usedToday);
    const remainingMonthly = Math.max(0, limits.creditsPerMonth - usedBaseMonth);
    const remaining = Math.min(remainingDaily, remainingMonthly);
    return {
      remaining,
      usedToday,
      usedThisMonth: usedBaseMonth,
      limit: limits.creditsPerMonth,
      plan,
    };
  }

  const flexLimit = await getProFlexLimit(userId);
  const limits = PLAN_LIMITS.pro;
  const flexRemaining = Math.max(0, flexLimit - flexUsed);
  const baseDailyRemaining = Math.max(0, limits.creditsPerDay - usedToday);
  const baseMonthlyRemaining = Math.max(0, limits.creditsPerMonth - usedBaseMonth);
  const baseRemaining = Math.min(baseDailyRemaining, baseMonthlyRemaining);
  const remaining = flexRemaining + baseRemaining;
  const usedThisMonth = flexUsed + usedBaseMonth;
  const limit = flexLimit + limits.creditsPerMonth;

  return {
    remaining,
    usedToday,
    usedThisMonth,
    limit,
    plan,
  };
}

/** Get workspace Pro credits (shared by all members). */
async function getWorkspaceCredits(
  workspaceId: string,
  flexLimit: number
): Promise<CreditsInfo> {
  const month = getCurrentMonthString();
  const monthlyDoc = await WorkspaceMonthlyCreditsModel.findOne({
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    month,
  }).lean();

  const flexUsed = monthlyDoc?.flexCreditsUsed ?? 0;
  const flexRemaining = Math.max(0, flexLimit - flexUsed);
  const limits = PLAN_LIMITS.pro;
  const usedThisMonth = flexUsed;
  const limit = flexLimit + limits.creditsPerMonth;

  return {
    remaining: flexRemaining,
    usedToday: 0,
    usedThisMonth,
    limit,
    plan: "pro",
  };
}

/** Deduct credits. When workspaceId provided and workspace is Pro, deduct from workspace pool. */
export async function deductCredits(
  userId: string,
  amount: number,
  workspaceId?: string
): Promise<CreditsInfo> {
  if (amount <= 0) return getCredits(userId, workspaceId);

  if (workspaceId) {
    const ws = await WorkspaceModel.findById(workspaceId)
      .select("planStatus proCreditsPerMonth")
      .lean();
    if (ws?.planStatus === "pro") {
      return deductWorkspaceCredits(workspaceId, amount, ws.proCreditsPerMonth ?? PRO_FLEX_CREDITS_DEFAULT);
    }
  }

  const date = getTodayDateString();
  const month = getCurrentMonthString();
  const plan = await getUserPlan(userId);

  if (plan === "free") {
    await Promise.all([
      UserDailyCreditsModel.findOneAndUpdate(
        { userId, date },
        { $inc: { creditsUsed: amount } },
        { new: true, upsert: true }
      ),
      UserMonthlyCreditsModel.findOneAndUpdate(
        { userId, month },
        { $inc: { creditsUsed: amount } },
        { new: true, upsert: true }
      ),
    ]);
    return getCredits(userId);
  }

  // User Pro: use flex first, then base
  const info = await getUserCredits(userId);
  const flexLimit = await getProFlexLimit(userId);
  const [dailyDoc, monthlyDoc] = await Promise.all([
    UserDailyCreditsModel.findOne({ userId, date }).lean(),
    UserMonthlyCreditsModel.findOne({ userId, month }).lean(),
  ]);
  const flexUsed = monthlyDoc?.flexCreditsUsed ?? 0;
  const baseUsed = monthlyDoc?.creditsUsed ?? 0;
  const baseUsedToday = dailyDoc?.creditsUsed ?? 0;
  const flexRemaining = Math.max(0, flexLimit - flexUsed);
  const baseDailyRemaining = Math.max(0, 5 - baseUsedToday);
  const baseMonthlyRemaining = Math.max(0, 150 - baseUsed);
  const baseRemaining = Math.min(baseDailyRemaining, baseMonthlyRemaining);

  const useFlex = Math.min(amount, flexRemaining);
  const useBase = amount - useFlex;

  if (useBase > baseRemaining) {
    const err = new Error(
      `Insufficient credits. You have ${info.remaining.toFixed(1)} credits remaining.`
    ) as Error & { code?: string };
    err.code = "INSUFFICIENT_CREDITS";
    throw err;
  }

  await UserMonthlyCreditsModel.findOneAndUpdate(
    { userId, month },
    {
      $inc: {
        creditsUsed: useBase,
        flexCreditsUsed: useFlex,
      },
    },
    { new: true, upsert: true }
  );
  if (useBase > 0) {
    await UserDailyCreditsModel.findOneAndUpdate(
      { userId, date },
      { $inc: { creditsUsed: useBase } },
      { new: true, upsert: true }
    );
  }
  return getUserCredits(userId);
}

/** Deduct from workspace Pro credits pool. */
async function deductWorkspaceCredits(
  workspaceId: string,
  amount: number,
  flexLimit: number
): Promise<CreditsInfo> {
  const info = await getWorkspaceCredits(workspaceId, flexLimit);
  if (info.remaining < amount) {
    const err = new Error(
      `Insufficient credits. This workspace has ${info.remaining.toFixed(1)} credits remaining.`
    ) as Error & { code?: string };
    err.code = "INSUFFICIENT_CREDITS";
    throw err;
  }
  const month = getCurrentMonthString();
  await WorkspaceMonthlyCreditsModel.findOneAndUpdate(
    {
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      month,
    },
    { $inc: { flexCreditsUsed: amount } },
    { new: true, upsert: true }
  );
  return getWorkspaceCredits(workspaceId, flexLimit);
}

/** Check if user/workspace has at least `amount` credits. Throws if not. */
export async function requireCredits(
  userId: string,
  amount: number,
  workspaceId?: string
): Promise<CreditsInfo> {
  const info = await getCredits(userId, workspaceId);
  if (info.remaining < amount) {
    const planLabel = info.plan === "pro" ? "Pro" : "Free";
    const err = new Error(
      `Insufficient credits. You have ${info.remaining.toFixed(1)} credits remaining.`
    ) as Error & { code?: string };
    err.code = "INSUFFICIENT_CREDITS";
    throw err;
  }
  return info;
}
