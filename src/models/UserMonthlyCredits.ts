import mongoose, { Document, Schema } from "mongoose";

/** Free plan: 100 credits per month (total cap). */
export const CREDITS_PER_MONTH = 100;

export interface UserMonthlyCreditsDocument extends Document {
  userId: string;
  month: string; // YYYY-MM (UTC)
  creditsUsed: number;
  updatedAt: Date;
}

const userMonthlyCreditsSchema = new Schema<UserMonthlyCreditsDocument>(
  {
    userId: { type: String, required: true, index: true },
    month: { type: String, required: true, index: true },
    creditsUsed: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

userMonthlyCreditsSchema.index({ userId: 1, month: 1 }, { unique: true });

const UserMonthlyCreditsModel = mongoose.model<UserMonthlyCreditsDocument>(
  "UserMonthlyCredits",
  userMonthlyCreditsSchema
);

export default UserMonthlyCreditsModel;
