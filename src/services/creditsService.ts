import mongoose from "mongoose";
import UserDailyCreditsModel from "../models/UserDailyCredits";
import UserMonthlyCreditsModel from "../models/UserMonthlyCredits";
import WorkspaceMonthlyCreditsModel from "../models/WorkspaceMonthlyCredits";
import WorkspaceModel from "../models/Workspace";
import UserModel from "../models/User";
import type { PlanId } from "../models/User";
import { PLAN_LIMITS, FLEX_CREDITS_DEFAULT, PRO_FLEX_CREDITS_DEFAULT } from "../config/planLimits";
import { isPaidPlan, getFlexCreditsForPlan, type PaidPlanTier } from "../config/plans";

function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
}

function getCurrentMonthString(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM UTC
}

/** Period key for credits tracking. Monthly: YYYY-MM. Annual: YYYY. */
function getPeriodKey(interval: "month" | "year", date: Date): string {
  const iso = date.toISOString();
  return interval === "year" ? iso.slice(0, 4) : iso.slice(0, 7);
}

/** Previous period key for rollover. */
function getPreviousPeriodKey(interval: "month" | "year", periodKey: string): string {
  if (interval === "year") {
    const y = parseInt(periodKey, 10);
    return String(y - 1);
  }
  const [y, m] = periodKey.split("-").map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

export interface CreditsInfo {
  remaining: number;
  usedToday: number;
  usedThisMonth: number;
  limit: number;
  plan: PlanId;
  /** Pro workspace/user: user's daily allowance remaining (5/day). Omitted or 0 when not applicable. */
  dailyRemaining?: number;
  /** Pro workspace/user: subscription + top-up credits remaining. Omitted or 0 when not applicable. */
  proRemaining?: number;
}

/** Get current user's plan (default 'free' if user not found). */
export async function getUserPlan(userId: string): Promise<PlanId> {
  const user = await UserModel.findById(userId).select("plan").lean();
  const plan = user?.plan;
  if (plan === "pro" || plan === "studio" || plan === "agency") return plan;
  return "free";
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
      .select("planStatus proCreditsPerMonth topUpCreditsBalance topUpCreditsExpiresAt stripeSubscriptionInterval")
      .lean();
    if (ws?.planStatus && isPaidPlan(ws.planStatus)) {
      return getWorkspaceCredits(workspaceId, userId, {
        plan: ws.planStatus,
        flexLimit: getFlexCreditsForPlan(ws.planStatus, ws.proCreditsPerMonth),
        topUpBalance: ws.topUpCreditsBalance ?? 0,
        topUpExpiresAt: ws.topUpCreditsExpiresAt,
        interval: ws.stripeSubscriptionInterval ?? "month",
      });
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
      dailyRemaining: remaining,
      proRemaining: 0,
    };
  }

  const flexLimit = await getProFlexLimit(userId);
  const limits = PLAN_LIMITS[plan];
  const interval: "month" | "year" = "month";
  const now = new Date();
  const periodKey = getPeriodKey(interval, now);
  let monthlyDocForFlex = await UserMonthlyCreditsModel.findOne({ userId, month: periodKey }).lean();
  if (!monthlyDocForFlex) {
    const prevPeriodKey = getPreviousPeriodKey(interval, periodKey);
    const prevDoc = await UserMonthlyCreditsModel.findOne({ userId, month: prevPeriodKey }).lean();
    const rollover = prevDoc
      ? (() => {
          const prevFlexUsed = prevDoc.flexCreditsUsed ?? 0;
          const prevRollover = prevDoc.flexCreditsRollover ?? 0;
          const prevLimit = flexLimit + prevRollover;
          const prevUnused = Math.max(0, prevLimit - prevFlexUsed);
          return Math.min(prevUnused, flexLimit);
        })()
      : 0;
    await UserMonthlyCreditsModel.findOneAndUpdate(
      { userId, month: periodKey },
      { $setOnInsert: { creditsUsed: 0, flexCreditsUsed: 0, flexCreditsRollover: rollover } },
      { upsert: true }
    );
    monthlyDocForFlex = await UserMonthlyCreditsModel.findOne({ userId, month: periodKey }).lean();
  }
  const flexRollover = monthlyDocForFlex?.flexCreditsRollover ?? 0;
  const effectiveFlexLimit = flexLimit + flexRollover;
  const flexUsedPro = monthlyDocForFlex?.flexCreditsUsed ?? monthlyDoc?.flexCreditsUsed ?? 0;
  const flexRemaining = Math.max(0, effectiveFlexLimit - flexUsedPro);
  const baseDailyRemaining = Math.max(0, limits.creditsPerDay - usedToday);
  const baseMonthlyRemaining = Math.max(0, limits.creditsPerMonth - usedBaseMonth);
  const baseRemaining = Math.min(baseDailyRemaining, baseMonthlyRemaining);
  const remaining = flexRemaining + baseRemaining;
  const usedThisMonth = flexUsedPro + usedBaseMonth;
  const limit = effectiveFlexLimit + limits.creditsPerDay;

  return {
    remaining,
    usedToday,
    usedThisMonth,
    limit,
    plan,
    dailyRemaining: baseRemaining,
    proRemaining: flexRemaining,
  };
}

/** Get workspace paid-tier credits (subscription + top-up + user's daily allowance). Supports rollover. */
async function getWorkspaceCredits(
  workspaceId: string,
  userId: string,
  opts: {
    plan: PaidPlanTier;
    flexLimit: number;
    topUpBalance?: number;
    topUpExpiresAt?: Date | null;
    interval?: "month" | "year";
  }
): Promise<CreditsInfo> {
  const { plan, flexLimit, topUpBalance = 0, topUpExpiresAt, interval = "month" } = opts;
  const now = new Date();
  const date = getTodayDateString();
  const month = getCurrentMonthString();
  const periodKey = getPeriodKey(interval, now);

  let monthlyDoc = await WorkspaceMonthlyCreditsModel.findOne({
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    month: periodKey,
  }).lean();

  if (!monthlyDoc) {
    const prevPeriodKey = getPreviousPeriodKey(interval, periodKey);
    const prevDoc = await WorkspaceMonthlyCreditsModel.findOne({
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      month: prevPeriodKey,
    }).lean();
    const rollover = prevDoc
      ? (() => {
          const prevFlexUsed = prevDoc.flexCreditsUsed ?? 0;
          const prevLimit = flexLimit + (prevDoc.flexCreditsRollover ?? 0);
          const prevUnused = Math.max(0, prevLimit - prevFlexUsed);
          return interval === "month"
            ? Math.min(prevUnused, flexLimit)
            : prevUnused;
        })()
      : 0;
    const wsId = new mongoose.Types.ObjectId(workspaceId);
    await WorkspaceMonthlyCreditsModel.findOneAndUpdate(
      { workspaceId: wsId, month: periodKey },
      { $setOnInsert: { creditsUsed: 0, flexCreditsUsed: 0, flexCreditsRollover: rollover } },
      { upsert: true }
    );
    const refetched = await WorkspaceMonthlyCreditsModel.findOne({
      workspaceId: wsId,
      month: periodKey,
    }).lean();
    monthlyDoc = refetched ?? ({ flexCreditsUsed: 0, flexCreditsRollover: rollover } as unknown as NonNullable<typeof monthlyDoc>);
  }

  const doc = monthlyDoc!;
  const flexRollover = doc.flexCreditsRollover ?? 0;
  const effectiveFlexLimit = flexLimit + flexRollover;
  const flexUsed = doc.flexCreditsUsed ?? 0;
  const flexRemaining = Math.max(0, effectiveFlexLimit - flexUsed);
  const topUpRemaining =
    topUpExpiresAt && topUpExpiresAt > now && topUpBalance > 0
      ? Math.max(0, topUpBalance)
      : 0;

  const [dailyDoc, monthlyUserDoc] = await Promise.all([
    UserDailyCreditsModel.findOne({ userId, date }).lean(),
    UserMonthlyCreditsModel.findOne({ userId, month }).lean(),
  ]);
  const limits = PLAN_LIMITS[plan];
  const usedToday = dailyDoc?.creditsUsed ?? 0;
  const usedBaseMonth = monthlyUserDoc?.creditsUsed ?? 0;
  const baseDailyRemaining = Math.max(0, limits.creditsPerDay - usedToday);
  const baseMonthlyRemaining = Math.max(0, limits.creditsPerMonth - usedBaseMonth);
  const baseRemaining = Math.min(baseDailyRemaining, baseMonthlyRemaining);

  const remaining = flexRemaining + topUpRemaining + baseRemaining;
  const usedThisMonth = flexUsed;
  const limit = effectiveFlexLimit + limits.creditsPerDay + topUpRemaining;
  const proRemaining = flexRemaining + topUpRemaining;

  return {
    remaining,
    usedToday,
    usedThisMonth,
    limit,
    plan,
    dailyRemaining: baseRemaining,
    proRemaining,
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
      .select("planStatus proCreditsPerMonth topUpCreditsBalance topUpCreditsExpiresAt stripeSubscriptionInterval")
      .lean();
    if (ws?.planStatus && isPaidPlan(ws.planStatus)) {
      return deductWorkspaceCredits(workspaceId, userId, amount, {
        plan: ws.planStatus,
        flexLimit: getFlexCreditsForPlan(ws.planStatus, ws.proCreditsPerMonth),
        topUpBalance: ws.topUpCreditsBalance ?? 0,
        topUpExpiresAt: ws.topUpCreditsExpiresAt,
        interval: ws.stripeSubscriptionInterval ?? "month",
      });
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

/** Deduct from workspace Pro credits pool (user daily first, then top-up, then subscription). */
async function deductWorkspaceCredits(
  workspaceId: string,
  userId: string,
  amount: number,
  opts: {
    plan: PaidPlanTier;
    flexLimit: number;
    topUpBalance?: number;
    topUpExpiresAt?: Date | null;
    interval?: "month" | "year";
  }
): Promise<CreditsInfo> {
  const { plan, flexLimit, topUpBalance = 0, topUpExpiresAt, interval = "month" } = opts;
  const info = await getWorkspaceCredits(workspaceId, userId, opts);
  if (info.remaining < amount) {
    const err = new Error(
      `Insufficient credits. This workspace has ${info.remaining.toFixed(1)} credits remaining.`
    ) as Error & { code?: string };
    err.code = "INSUFFICIENT_CREDITS";
    throw err;
  }

  const date = getTodayDateString();
  const month = getCurrentMonthString();
  const limits = PLAN_LIMITS[plan];

  const [dailyDoc, monthlyUserDoc] = await Promise.all([
    UserDailyCreditsModel.findOne({ userId, date }).lean(),
    UserMonthlyCreditsModel.findOne({ userId, month }).lean(),
  ]);
  const usedToday = dailyDoc?.creditsUsed ?? 0;
  const usedBaseMonth = monthlyUserDoc?.creditsUsed ?? 0;
  const baseDailyRemaining = Math.max(0, limits.creditsPerDay - usedToday);
  const baseMonthlyRemaining = Math.max(0, limits.creditsPerMonth - usedBaseMonth);
  const baseRemaining = Math.min(baseDailyRemaining, baseMonthlyRemaining);

  const useBase = Math.min(amount, baseRemaining);
  const useWorkspace = amount - useBase;

  if (useBase > 0) {
    await Promise.all([
      UserDailyCreditsModel.findOneAndUpdate(
        { userId, date },
        { $inc: { creditsUsed: useBase } },
        { new: true, upsert: true }
      ),
      UserMonthlyCreditsModel.findOneAndUpdate(
        { userId, month },
        { $inc: { creditsUsed: useBase } },
        { new: true, upsert: true }
      ),
    ]);
  }

  if (useWorkspace > 0) {
    const now = new Date();
    const topUpRemaining =
      topUpExpiresAt && topUpExpiresAt > now && topUpBalance > 0
        ? Math.max(0, topUpBalance)
        : 0;
    const useTopUp = Math.min(useWorkspace, topUpRemaining);
    const useFlex = useWorkspace - useTopUp;

    const wsId = new mongoose.Types.ObjectId(workspaceId);
    if (useTopUp > 0) {
      await WorkspaceModel.findByIdAndUpdate(workspaceId, {
        $inc: { topUpCreditsBalance: -useTopUp },
      });
    }
    if (useFlex > 0) {
      const periodKey = getPeriodKey(interval, new Date());
      await WorkspaceMonthlyCreditsModel.findOneAndUpdate(
        { workspaceId: wsId, month: periodKey },
        { $inc: { flexCreditsUsed: useFlex } },
        { new: true, upsert: true }
      );
    }
  }

  const ws = await WorkspaceModel.findById(workspaceId)
    .select("topUpCreditsBalance topUpCreditsExpiresAt stripeSubscriptionInterval")
    .lean();
  return getWorkspaceCredits(workspaceId, userId, {
    plan,
    flexLimit,
    topUpBalance: ws?.topUpCreditsBalance ?? 0,
    topUpExpiresAt: ws?.topUpCreditsExpiresAt,
    interval: ws?.stripeSubscriptionInterval ?? "month",
  });
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
