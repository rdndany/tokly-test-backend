import mongoose, { Document, Schema } from "mongoose";

export type WorkspacePlanStatus = "free" | "inactive" | "pro";

export interface WorkspaceDocument extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  avatar?: string;
  createdBy: string;
  /** free = default workspace, inactive = created but unpaid, pro = has subscription */
  planStatus?: WorkspacePlanStatus;
  /** Stripe subscription ID when workspace is Pro */
  stripeSubscriptionId?: string;
  /** Pro flex credits per month (from subscription). Used when planStatus is pro. */
  proCreditsPerMonth?: number;
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
      enum: ["free", "inactive", "pro"],
      default: undefined,
    },
    stripeSubscriptionId: { type: String, trim: true, sparse: true },
    proCreditsPerMonth: { type: Number, default: undefined },
  },
  { timestamps: true }
);

const WorkspaceModel = mongoose.model<WorkspaceDocument>(
  "Workspace",
  workspaceSchema
);
export default WorkspaceModel;
