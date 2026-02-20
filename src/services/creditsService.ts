import UserDailyCreditsModel from "../models/UserDailyCredits";
import UserMonthlyCreditsModel from "../models/UserMonthlyCredits";
import UserModel from "../models/User";
import type { PlanId } from "../models/User";
import { PLAN_LIMITS } from "../config/planLimits";

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

/** Get current user's credits. Limits depend on plan (free vs pro). */
export async function getCredits(userId: string): Promise<CreditsInfo> {
  const date = getTodayDateString();
  const month = getCurrentMonthString();
  const plan = await getUserPlan(userId);
  const limits = PLAN_LIMITS[plan];
  const [dailyDoc, monthlyDoc] = await Promise.all([
    UserDailyCreditsModel.findOne({ userId, date }).lean(),
    UserMonthlyCreditsModel.findOne({ userId, month }).lean(),
  ]);
  const usedToday = dailyDoc?.creditsUsed ?? 0;
  const usedThisMonth = monthlyDoc?.creditsUsed ?? 0;
  const remainingDaily = Math.max(0, limits.creditsPerDay - usedToday);
  const remainingMonthly = Math.max(0, limits.creditsPerMonth - usedThisMonth);
  const remaining = Math.min(remainingDaily, remainingMonthly);
  return {
    remaining,
    usedToday,
    usedThisMonth,
    limit: limits.creditsPerMonth,
    plan,
  };
}

/** Deduct credits. Throws if insufficient. Updates both daily and monthly usage. */
export async function deductCredits(
  userId: string,
  amount: number
): Promise<CreditsInfo> {
  if (amount <= 0) return getCredits(userId);
  const date = getTodayDateString();
  const month = getCurrentMonthString();
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

/** Check if user has at least `amount` credits. Throws if not. */
export async function requireCredits(userId: string, amount: number): Promise<CreditsInfo> {
  const info = await getCredits(userId);
  if (info.remaining < amount) {
    const limits = PLAN_LIMITS[info.plan];
    const planLabel = info.plan === "pro" ? "Pro" : "Free";
    const err = new Error(
      `Insufficient credits. You have ${info.remaining.toFixed(1)} credits remaining. ${planLabel} plan: ${limits.creditsPerDay} credits per day, ${limits.creditsPerMonth} per month.`
    ) as Error & { code?: string };
    err.code = "INSUFFICIENT_CREDITS";
    throw err;
  }
  return info;
}
