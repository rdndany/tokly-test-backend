import mongoose, { Document, Schema } from "mongoose";

export interface PaymentDocument extends Document {
  /** Stripe Checkout Session ID – idempotency for webhooks */
  stripeSessionId: string;
  userId: string;
  /** Workspace ID when payment is for a workspace (Pro or top-up) */
  workspaceId?: mongoose.Types.ObjectId;
  /** Amount in USD (display/reporting) */
  priceAmount: number;
  currency: string;
  /** 'subscription' | 'topup' */
  type: string;
  createdAt: Date;
}

const paymentSchema = new Schema<PaymentDocument>(
  {
    stripeSessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      default: undefined,
      index: true,
    },
    priceAmount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "usd",
    },
    type: {
      type: String,
      enum: ["subscription", "topup"],
      required: true,
    },
  },
  { timestamps: true }
);

paymentSchema.index({ createdAt: 1 });

const PaymentModel = mongoose.model<PaymentDocument>("Payment", paymentSchema);
export default PaymentModel;
