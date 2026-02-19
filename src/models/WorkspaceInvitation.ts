import mongoose, { Document, Schema } from "mongoose";

export type InvitationRole = "admin" | "editor" | "viewer";
export type InvitationStatus = "pending" | "accepted" | "expired" | "cancelled";

export interface WorkspaceInvitationDocument extends Document {
  _id: mongoose.Types.ObjectId;
  workspaceId: mongoose.Types.ObjectId;
  email: string;
  role: InvitationRole;
  invitedBy: string;
  status: InvitationStatus;
  token: string;
  expiresAt: Date;
  acceptedAt?: Date;
  acceptedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const workspaceInvitationSchema = new Schema<WorkspaceInvitationDocument>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["admin", "editor", "viewer"],
      required: true,
    },
    invitedBy: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "expired", "cancelled"],
      default: "pending",
      index: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    acceptedAt: Date,
    acceptedBy: String,
  },
  { timestamps: true }
);

workspaceInvitationSchema.index(
  { workspaceId: 1, email: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending" },
  }
);

const WorkspaceInvitationModel = mongoose.model<WorkspaceInvitationDocument>(
  "WorkspaceInvitation",
  workspaceInvitationSchema
);
export default WorkspaceInvitationModel;
