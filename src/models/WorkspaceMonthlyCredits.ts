import mongoose, { Document, Schema } from "mongoose";

export interface WorkspaceMonthlyCreditsDocument extends Document {
  workspaceId: mongoose.Types.ObjectId;
  month: string; // YYYY-MM (UTC)
  creditsUsed: number;
  /** Pro flex credits used this month (subscription pool). Default 0. */
  flexCreditsUsed?: number;
  /** Rollover from previous billing period (unused credits carried over). Default 0. */
  flexCreditsRollover?: number;
  updatedAt: Date;
}

const workspaceMonthlyCreditsSchema = new Schema<WorkspaceMonthlyCreditsDocument>(
  {
    workspaceId: { type: Schema.Types.ObjectId, required: true, index: true, ref: "Workspace" },
    month: { type: String, required: true, index: true },
    creditsUsed: { type: Number, required: true, default: 0 },
    flexCreditsUsed: { type: Number, default: 0 },
    flexCreditsRollover: { type: Number, default: 0 },
  },
  { timestamps: true }
);

workspaceMonthlyCreditsSchema.index({ workspaceId: 1, month: 1 }, { unique: true });

const WorkspaceMonthlyCreditsModel = mongoose.model<WorkspaceMonthlyCreditsDocument>(
  "WorkspaceMonthlyCredits",
  workspaceMonthlyCreditsSchema
);

export default WorkspaceMonthlyCreditsModel;
