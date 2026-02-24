import mongoose, { Document, Schema } from "mongoose";

export interface IReferral extends Document {
  referrerId: string;
  referredUserId: string;
  totalCommissionAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

const ReferralSchema = new Schema<IReferral>(
  {
    referrerId: { type: String, required: true, trim: true },
    referredUserId: { type: String, required: true, trim: true },
    totalCommissionAmount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

ReferralSchema.index({ referrerId: 1 });
ReferralSchema.index({ referredUserId: 1 });
ReferralSchema.index({ createdAt: -1 });
ReferralSchema.index({ referrerId: 1, referredUserId: 1 }, { unique: true });

export default mongoose.models?.Referral ?? mongoose.model<IReferral>("Referral", ReferralSchema);
