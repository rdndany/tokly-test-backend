import mongoose, { Document, Schema } from "mongoose";

/** Free plan: 5 credits per day. */
export const CREDITS_PER_DAY = 5;

export interface UserDailyCreditsDocument extends Document {
  userId: string;
  date: string; // YYYY-MM-DD (UTC)
  creditsUsed: number;
  updatedAt: Date;
}

const userDailyCreditsSchema = new Schema<UserDailyCreditsDocument>(
  {
    userId: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },
    creditsUsed: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

userDailyCreditsSchema.index({ userId: 1, date: 1 }, { unique: true });

const UserDailyCreditsModel = mongoose.model<UserDailyCreditsDocument>(
  "UserDailyCredits",
  userDailyCreditsSchema
);

export default UserDailyCreditsModel;
