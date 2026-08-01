import type { PlanId } from "../models/User";
import {
  FREE_PLAN_CONFIG,
  PLAN_TIER_CONFIG,
  type PaidPlanTier,
} from "./plans";

export interface PlanLimits {
  creditsPerDay: number;
  creditsPerMonth: number;
}

/** Free: 5/day, 30/month. Paid base: 5/day, 150/month (floor after flex). */
export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    creditsPerDay: FREE_PLAN_CONFIG.creditsPerDay,
    creditsPerMonth: FREE_PLAN_CONFIG.creditsPerMonth,
  },
  pro: {
    creditsPerDay: PLAN_TIER_CONFIG.pro.creditsPerDay,
    creditsPerMonth: PLAN_TIER_CONFIG.pro.creditsPerMonthBase,
  },
  studio: {
    creditsPerDay: PLAN_TIER_CONFIG.studio.creditsPerDay,
    creditsPerMonth: PLAN_TIER_CONFIG.studio.creditsPerMonthBase,
  },
  agency: {
    creditsPerDay: PLAN_TIER_CONFIG.agency.creditsPerDay,
    creditsPerMonth: PLAN_TIER_CONFIG.agency.creditsPerMonthBase,
  },
};

/** Default flex credits per paid tier (subscription). */
export const FLEX_CREDITS_DEFAULT: Record<PaidPlanTier, number> = {
  pro: PLAN_TIER_CONFIG.pro.flexCreditsPerMonth,
  studio: PLAN_TIER_CONFIG.studio.flexCreditsPerMonth,
  agency: PLAN_TIER_CONFIG.agency.flexCreditsPerMonth,
};

/** @deprecated Use FLEX_CREDITS_DEFAULT.pro */
export const PRO_FLEX_CREDITS_DEFAULT = FLEX_CREDITS_DEFAULT.pro;
