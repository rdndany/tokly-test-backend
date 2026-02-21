import mongoose, { Document, Schema } from "mongoose";

/** Free plan: 30 credits per month (total cap). */
export const CREDITS_PER_MONTH = 30;

export interface UserMonthlyCreditsDocument extends Document {
  userId: string;
  month: string; // YYYY-MM (UTC)
  creditsUsed: number;
  /** Pro flex credits used this month (subscription pool). Default 0. */
  flexCreditsUsed?: number;
  /** Rollover from previous billing period (unused credits carried over). Default 0. */
  flexCreditsRollover?: number;
  updatedAt: Date;
}

const userMonthlyCreditsSchema = new Schema<UserMonthlyCreditsDocument>(
  {
    userId: { type: String, required: true, index: true },
    month: { type: String, required: true, index: true },
    creditsUsed: { type: Number, required: true, default: 0 },
    flexCreditsUsed: { type: Number, default: 0 },
    flexCreditsRollover: { type: Number, default: 0 },
  },
  { timestamps: true }
);

userMonthlyCreditsSchema.index({ userId: 1, month: 1 }, { unique: true });

const UserMonthlyCreditsModel = mongoose.model<UserMonthlyCreditsDocument>(
  "UserMonthlyCredits",
  userMonthlyCreditsSchema
);

export default UserMonthlyCreditsModel;
