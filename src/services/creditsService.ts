import UserDailyCreditsModel from "../models/UserDailyCredits";
import UserMonthlyCreditsModel from "../models/UserMonthlyCredits";
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

/** Get current user's credits. Free: 5/day, 30/month. Pro: flex (burst) + base (5/day, 150/month). */
export async function getCredits(userId: string): Promise<CreditsInfo> {
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

  // Pro: flex pool (burst) + base pool (5/day, 150/month)
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

/** Deduct credits. Throws if insufficient. Free: single pool. Pro: flex first, then base. */
export async function deductCredits(
  userId: string,
  amount: number
): Promise<CreditsInfo> {
  if (amount <= 0) return getCredits(userId);
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

  // Pro: use flex first, then base
  const info = await getCredits(userId);
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
  return getCredits(userId);
}

/** Check if user has at least `amount` credits. Throws if not. */
export async function requireCredits(userId: string, amount: number): Promise<CreditsInfo> {
  const info = await getCredits(userId);
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
