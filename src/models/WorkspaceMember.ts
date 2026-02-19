import mongoose, { Document, Schema } from "mongoose";

export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer" | "member";

export interface WorkspaceMemberDocument extends Document {
  _id: mongoose.Types.ObjectId;
  workspaceId: mongoose.Types.ObjectId;
  userId: string;
  role: WorkspaceRole;
  createdAt: Date;
  updatedAt: Date;
}

const workspaceMemberSchema = new Schema<WorkspaceMemberDocument>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["owner", "admin", "editor", "viewer", "member"],
      default: "editor",
    },
  },
  { timestamps: true }
);

workspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

const WorkspaceMemberModel = mongoose.model<WorkspaceMemberDocument>(
  "WorkspaceMember",
  workspaceMemberSchema
);
export default WorkspaceMemberModel;
