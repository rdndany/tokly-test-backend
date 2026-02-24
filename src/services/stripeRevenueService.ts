import Stripe from "stripe";
import config from "../config";

const stripe: Stripe | null = config.stripe.secretKey
  ? new Stripe(config.stripe.secretKey)
  : null;

export interface StripeChargeSummary {
  totalRevenueUsd: number;
  totalPayments: number;
  byDay: { dateIso: string; label: string; revenueUsd: number }[];
}

/**
 * Fetch all successful charges from Stripe (subscriptions + one-time). Amounts are in cents in Stripe; we return USD.
 * When Stripe is not configured, returns null so callers can fall back to DB.
 */
export async function fetchStripeChargeSummary(options?: {
  startDate?: string;
  endDate?: string;
}): Promise<StripeChargeSummary | null> {
  if (!stripe) return null;

  const created: { gte?: number; lte?: number } = {};
  if (options?.startDate) {
    created.gte = Math.floor(new Date(options.startDate).getTime() / 1000);
  }
  if (options?.endDate) {
    const end = new Date(options.endDate);
    end.setUTCDate(end.getUTCDate() + 1);
    created.lte = Math.floor(end.getTime() / 1000) - 1;
  }

  const byDayMap = new Map<string, number>();
  let totalRevenueCents = 0;
  let totalPayments = 0;
  let startingAfter: string | undefined;

  do {
    const listParams: Stripe.ChargeListParams = {
      limit: 100,
      ...(Object.keys(created).length > 0 ? { created } : {}),
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    };

    const response = await stripe.charges.list(listParams);

    for (const charge of response.data) {
      if (charge.status !== "succeeded") continue;
      const amount = charge.amount;
      if (amount <= 0) continue;
      totalRevenueCents += amount;
      totalPayments += 1;

      const d = new Date(charge.created * 1000);
      const dateIso = d.toISOString().slice(0, 10);
      byDayMap.set(dateIso, (byDayMap.get(dateIso) ?? 0) + amount);
    }

    if (!response.has_more || response.data.length === 0) break;
    startingAfter = response.data[response.data.length - 1].id;
  } while (true);

  const byDay = Array.from(byDayMap.entries())
    .map(([dateIso, cents]) => ({
      dateIso,
      label: (() => {
        const d = new Date(dateIso);
        return d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: d.getFullYear() !== new Date().getFullYear() ? "2-digit" : undefined,
        });
      })(),
      revenueUsd: Math.round((cents / 100) * 100) / 100,
    }))
    .sort((a, b) => a.dateIso.localeCompare(b.dateIso));

  const totalRevenueUsd = Math.round((totalRevenueCents / 100) * 100) / 100;

  return {
    totalRevenueUsd,
    totalPayments,
    byDay,
  };
}

/**
 * Count of currently active subscriptions from Stripe.
 * When Stripe is not configured, returns null so callers can fall back to DB (e.g. workspace Pro count).
 */
export async function fetchStripeActiveSubscriptionCount(): Promise<number | null> {
  if (!stripe) return null;

  let count = 0;
  let startingAfter: string | undefined;

  do {
    const listParams: Stripe.SubscriptionListParams = {
      limit: 100,
      status: "active",
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    };

    const response = await stripe.subscriptions.list(listParams);
    count += response.data.length;

    if (!response.has_more || response.data.length === 0) break;
    startingAfter = response.data[response.data.length - 1].id;
  } while (true);

  return count;
}
