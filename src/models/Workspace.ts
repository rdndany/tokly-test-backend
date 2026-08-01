import mongoose, { Document, Schema } from "mongoose";

export type WorkspacePlanStatus = "free" | "inactive" | "pro" | "studio" | "agency";

export interface WorkspaceDocument extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  avatar?: string;
  createdBy: string;
  /** free = default workspace, inactive = created but unpaid, pro/studio/agency = paid tiers */
  planStatus?: WorkspacePlanStatus;
  /** Stripe subscription ID when workspace is on a paid tier */
  stripeSubscriptionId?: string;
  /** Flex credits per month (from subscription). Used when planStatus is a paid tier. */
  proCreditsPerMonth?: number;
  /** Billing interval from Stripe subscription. Affects rollover: monthly = 1 month, annual = until end of year. */
  stripeSubscriptionInterval?: "month" | "year";
  /** One-time top-up credits balance (valid 12 months from most recent purchase). */
  topUpCreditsBalance?: number;
  /** Expiry of top-up credits (12 months from most recent purchase). */
  topUpCreditsExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const workspaceSchema = new Schema<WorkspaceDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    avatar: {
      type: String,
      default: undefined,
    },
    createdBy: {
      type: String,
      required: true,
      index: true,
    },
    planStatus: {
      type: String,
      enum: ["free", "inactive", "pro", "studio", "agency"],
      default: undefined,
    },
    stripeSubscriptionId: { type: String, trim: true, sparse: true },
    proCreditsPerMonth: { type: Number, default: undefined },
    stripeSubscriptionInterval: { type: String, enum: ["month", "year"], default: undefined },
    topUpCreditsBalance: { type: Number, default: 0 },
    topUpCreditsExpiresAt: { type: Date, default: undefined },
  },
  { timestamps: true }
);

const WorkspaceModel = mongoose.model<WorkspaceDocument>(
  "Workspace",
  workspaceSchema
);
export default WorkspaceModel;
