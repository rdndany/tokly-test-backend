import type { PlanId } from "../models/User";

export interface PlanLimits {
  creditsPerDay: number;
  creditsPerMonth: number;
}

/** Free: 5/day, 30/month. Pro base: 5/day, 150/month (floor after flex). */
export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    creditsPerDay: 5,
    creditsPerMonth: 30,
  },
  pro: {
    creditsPerDay: 5,
    creditsPerMonth: 150,
  },
};

/** Pro flex credits default (subscription). User can burst these in one day. */
export const PRO_FLEX_CREDITS_DEFAULT = 100;
