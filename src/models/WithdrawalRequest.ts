import mongoose, { Document, Schema } from "mongoose";

export interface IWithdrawalRequest extends Document {
  _id: mongoose.Types.ObjectId;
  userId: string;
  amount: number;
  solanaWallet: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  transactionHash?: string;
  adminNotes?: string;
  processedBy?: string;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WithdrawalRequestSchema = new Schema<IWithdrawalRequest>(
  {
    userId: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 100 },
    solanaWallet: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (v: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v),
        message: "Invalid Solana wallet address format",
      },
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed", "cancelled"],
      default: "pending",
    },
    transactionHash: { type: String, trim: true },
    adminNotes: { type: String, trim: true },
    processedBy: { type: String, trim: true },
    processedAt: { type: Date },
  },
  { timestamps: true }
);

WithdrawalRequestSchema.index({ userId: 1 });
WithdrawalRequestSchema.index({ status: 1 });
WithdrawalRequestSchema.index({ createdAt: -1 });

export default mongoose.models?.WithdrawalRequest ?? mongoose.model<IWithdrawalRequest>("WithdrawalRequest", WithdrawalRequestSchema);
