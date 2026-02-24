import UserModel, { UserDocument } from "../models/User";
import ReferralModel, { IReferral } from "../models/Referral";
import WithdrawalRequestModel from "../models/WithdrawalRequest";
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

const MIN_WITHDRAWAL_USD = 100;

export async function getSolanaWallet(userId: string): Promise<string | null> {
  const user = await UserModel.findById(userId).select("solanaWallet").lean();
  const w = (user as { solanaWallet?: string } | null)?.solanaWallet;
  return (typeof w === "string" && w.trim()) ? w.trim() : null;
}

export async function updateSolanaWallet(userId: string, solanaWallet: string): Promise<void> {
  const trimmed = solanaWallet.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
    throw new Error("Invalid Solana wallet address format");
  }
  const updated = await UserModel.findByIdAndUpdate(userId, { solanaWallet: trimmed }, { new: true });
  if (!updated) throw new Error("User not found");
  logger.info(`Updated Solana wallet for user ${userId}`);
}

export async function createWithdrawalRequest(
  userId: string,
  amount: number,
  solanaWallet: string
): Promise<{ _id: string; amount: number; solanaWallet: string; status: string; createdAt: Date }> {
  const stats = await getAffiliateStats(userId);
  if (amount > stats.availableBalance) {
    throw new Error("Insufficient commission balance");
  }
  if (amount < MIN_WITHDRAWAL_USD) {
    throw new Error(`Minimum withdrawal amount is $${MIN_WITHDRAWAL_USD}`);
  }
  const pending = await WithdrawalRequestModel.countDocuments({
    userId,
    status: { $in: ["pending", "processing"] },
  });
  if (pending > 0) {
    throw new Error("You already have a pending withdrawal request");
  }
  const wallet = solanaWallet.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
    throw new Error("Invalid Solana wallet address format");
  }
  const doc = await WithdrawalRequestModel.create({
    userId,
    amount,
    solanaWallet: wallet,
    status: "pending",
  });
  logger.info(`Created withdrawal request ${doc._id} for user ${userId}: $${amount}`);
  return {
    _id: String(doc._id),
    amount: doc.amount,
    solanaWallet: doc.solanaWallet,
    status: doc.status,
    createdAt: doc.createdAt,
  };
}

export async function getWithdrawalRequests(userId: string): Promise<
  Array<{
    id: string;
    amount: number;
    solanaWallet: string;
    status: string;
    transactionHash?: string;
    adminNotes?: string;
    processedAt?: Date;
    createdAt: Date;
  }>
> {
  const list = await WithdrawalRequestModel.find({ userId }).sort({ createdAt: -1 }).lean();
  return list.map((r: unknown) => {
    const row = r as { _id: unknown; amount: number; solanaWallet: string; status: string; transactionHash?: string; adminNotes?: string; processedAt?: Date; createdAt: Date };
    return {
      id: String(row._id),
      amount: row.amount,
      solanaWallet: row.solanaWallet,
      status: row.status,
      transactionHash: row.transactionHash,
      adminNotes: row.adminNotes,
      processedAt: row.processedAt,
      createdAt: row.createdAt,
    };
  });
}

export async function cancelWithdrawalRequest(requestId: string, userId: string): Promise<void> {
  const doc = await WithdrawalRequestModel.findOne({ _id: requestId, userId, status: "pending" });
  if (!doc) throw new Error("Withdrawal request not found or cannot be cancelled");
  doc.status = "cancelled";
  await doc.save();
  logger.info(`Cancelled withdrawal request ${requestId} for user ${userId}`);
}

export async function getWithdrawalStats(userId: string): Promise<{
  totalWithdrawn: number;
  pendingWithdrawals: number;
  totalRequests: number;
}> {
  const [completed, pendingList, all] = await Promise.all([
    WithdrawalRequestModel.find({ userId, status: "completed" }).lean(),
    WithdrawalRequestModel.find({ userId, status: { $in: ["pending", "processing"] } }).lean(),
    WithdrawalRequestModel.find({ userId }).lean(),
  ]);
  const totalWithdrawn = completed.reduce((s, r) => s + (r as unknown as { amount: number }).amount, 0);
  const pendingWithdrawals = pendingList.reduce((s, r) => s + (r as unknown as { amount: number }).amount, 0);
  return { totalWithdrawn, pendingWithdrawals, totalRequests: all.length };
}
