/** Paid subscription tiers for workspaces. */
export type PaidPlanTier = "pro" | "studio" | "agency";

export type WorkspacePlanTier = "free" | "inactive" | PaidPlanTier;

export const PAID_PLAN_TIERS: PaidPlanTier[] = ["pro", "studio", "agency"];

export interface PlanTierConfig {
  id: PaidPlanTier;
  name: string;
  monthlyPriceUsd: number;
  flexCreditsPerMonth: number;
  liveSites: number;
  creditsPerDay: number;
  creditsPerMonthBase: number;
  maxSeats: number;
}

export const PLAN_TIER_CONFIG: Record<PaidPlanTier, PlanTierConfig> = {
  pro: {
    id: "pro",
    name: "Pro",
    monthlyPriceUsd: 25,
    flexCreditsPerMonth: 100,
    liveSites: 3,
    creditsPerDay: 5,
    creditsPerMonthBase: 150,
    maxSeats: 1,
  },
  studio: {
    id: "studio",
    name: "Studio",
    monthlyPriceUsd: 79,
    flexCreditsPerMonth: 400,
    liveSites: 10,
    creditsPerDay: 5,
    creditsPerMonthBase: 150,
    maxSeats: 3,
  },
  agency: {
    id: "agency",
    name: "Agency",
    monthlyPriceUsd: 199,
    flexCreditsPerMonth: 1000,
    liveSites: 30,
    creditsPerDay: 5,
    creditsPerMonthBase: 150,
    maxSeats: 10,
  },
};

export const FREE_PLAN_CONFIG = {
  liveSites: 1,
  creditsPerDay: 5,
  creditsPerMonth: 30,
};

const TIER_RANK: Record<WorkspacePlanTier, number> = {
  inactive: 0,
  free: 0,
  pro: 1,
  studio: 2,
  agency: 3,
};

export function isPaidPlan(
  status?: string | null
): status is PaidPlanTier {
  return status === "pro" || status === "studio" || status === "agency";
}

export function isPaidPlanTier(value: string): value is PaidPlanTier {
  return PAID_PLAN_TIERS.includes(value as PaidPlanTier);
}

export function getLiveSiteLimit(status?: string | null): number {
  if (isPaidPlan(status)) return PLAN_TIER_CONFIG[status].liveSites;
  if (status === "inactive") return 0;
  return FREE_PLAN_CONFIG.liveSites;
}

export function getPlanLabel(status?: string | null): string {
  if (isPaidPlan(status)) return PLAN_TIER_CONFIG[status].name;
  if (status === "inactive") return "Inactive";
  return "Free";
}

export function getFlexCreditsForPlan(status?: string | null, stored?: number): number {
  if (isPaidPlan(status)) {
    return stored ?? PLAN_TIER_CONFIG[status].flexCreditsPerMonth;
  }
  return 0;
}

export function isTierAtLeast(
  current?: string | null,
  minimum?: PaidPlanTier
): boolean {
  if (!minimum) return true;
  const currentRank = isPaidPlan(current)
    ? TIER_RANK[current]
    : TIER_RANK[(current as WorkspacePlanTier) ?? "free"];
  return currentRank >= TIER_RANK[minimum];
}

/** Annual = pay 10 months, get 12. */
export function annualPriceFromMonthly(monthlyUsd: number): {
  perMonthDisplay: number;
  totalYearUsd: number;
  saveDollars: number;
} {
  const totalYearUsd = monthlyUsd * 10;
  const perMonthDisplay = Math.round((monthlyUsd * 10) / 12);
  return { perMonthDisplay, totalYearUsd, saveDollars: monthlyUsd * 2 };
}
