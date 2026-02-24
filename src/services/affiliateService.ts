import UserModel, { UserDocument } from "../models/User";
import ReferralModel, { IReferral } from "../models/Referral";
import { createLogger } from "../utils/logger";

const logger = createLogger("AffiliateService");

export async function generateAffiliateCode(userId: string): Promise<string> {
  const existing = await UserModel.findById(userId);
  if (existing?.affiliateCode) {
    throw new Error("User already has an affiliate code");
  }

  let code = "";
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    code = Math.random().toString(36).substring(2, 10).toUpperCase();
    const exists = await UserModel.findOne({ affiliateCode: code });
    if (!exists) break;
    attempts++;
  }

  if (!code) throw new Error("Failed to generate unique affiliate code");

  const updated = await UserModel.findByIdAndUpdate(
    userId,
    { affiliateCode: code },
    { new: true }
  );
  if (!updated) throw new Error("User not found");

  logger.info(`Generated affiliate code ${code} for user ${userId}`);
  return code;
}

export async function getAffiliateCode(userId: string): Promise<string | null> {
  const user = await UserModel.findById(userId);
  return user?.affiliateCode ?? null;
}

export async function getUserByAffiliateCode(affiliateCode: string): Promise<UserDocument | null> {
  const normalized = affiliateCode?.trim().toUpperCase();
  if (!normalized) return null;
  return UserModel.findOne({ affiliateCode: normalized });
}

export async function trackReferral(referrerId: string, referredUserId: string): Promise<IReferral> {
  if (referrerId === referredUserId) {
    throw new Error("Users cannot refer themselves");
  }

  const referral = await ReferralModel.findOneAndUpdate(
    { referrerId, referredUserId },
    { referrerId, referredUserId, totalCommissionAmount: 0 },
    { upsert: true, new: true, runValidators: true }
  );
  logger.info(`Tracked referral: ${referrerId} -> ${referredUserId}`);
  return referral;
}

export async function getReferrals(userId: string): Promise<IReferral[]> {
  const referrals = await ReferralModel.find({ referrerId: userId })
    .sort({ createdAt: -1 })
    .lean();
  return referrals as unknown as IReferral[];
}

/** Affiliate stats for the current user. Commission/balance are 0 until Payment integration exists. */
export async function getAffiliateStats(userId: string): Promise<{
  totalReferrals: number;
  paidReferrals: number;
  totalCommission: number;
  availableBalance: number;
}> {
  const referrals = await ReferralModel.find({ referrerId: userId });
  const totalReferrals = referrals.length;
  return {
    totalReferrals,
    paidReferrals: 0,
    totalCommission: 0,
    availableBalance: 0,
  };
}

/** Referral accounts (referred users with commission summary). Commission is 0 for now. */
export async function getReferralAccounts(userId: string): Promise<
  Array<{
    referredUserId: string;
    referredUserName?: string;
    referredUserEmail?: string;
    totalCommission: number;
    totalPayments: number;
    createdAt: string;
    lastPaymentDate?: string;
  }>
> {
  const referrals = await ReferralModel.find({ referrerId: userId })
    .sort({ createdAt: -1 })
    .lean();
  const accounts = await Promise.all(
    referrals.map(async (r) => {
      const user = await UserModel.findById(r.referredUserId).select("name email createdAt").lean();
      return {
        referredUserId: r.referredUserId,
        referredUserName: user?.name,
        referredUserEmail: user?.email,
        totalCommission: r.totalCommissionAmount ?? 0,
        totalPayments: 0,
        createdAt: (r as unknown as { createdAt: Date }).createdAt?.toISOString?.() ?? "",
        lastPaymentDate: undefined,
      };
    })
  );
  return accounts;
}

/** Referral payments list. Empty until Payment integration with referrerId exists. */
export async function getReferralPayments(userId: string): Promise<unknown[]> {
  return [];
}
