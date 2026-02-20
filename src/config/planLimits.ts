import type { PlanId } from "../models/User";

export interface PlanLimits {
  creditsPerDay: number;
  creditsPerMonth: number;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    creditsPerDay: 10,
    creditsPerMonth: 100,
  },
  pro: {
    creditsPerDay: 100,
    creditsPerMonth: 1000,
  },
};
