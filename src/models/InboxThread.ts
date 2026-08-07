import mongoose, { Document, Schema } from "mongoose";

export type InboxAudience = "direct" | "broadcast";

export interface IInboxThread extends Document {
  participantUserId: string;
  subject: string;
  createdByAdminId: string;
  lastMessageAt: Date;
  lastMessagePreview: string;
  userUnreadCount: number;
  adminUnreadCount: number;
  audience: InboxAudience;
  broadcastId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const InboxThreadSchema = new Schema<IInboxThread>(
  {
    participantUserId: { type: String, required: true, index: true },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    createdByAdminId: { type: String, required: true, index: true },
    lastMessageAt: { type: Date, required: true, index: true },
    lastMessagePreview: { type: String, required: true, trim: true, maxlength: 280 },
    userUnreadCount: { type: Number, default: 0, min: 0 },
    adminUnreadCount: { type: Number, default: 0, min: 0 },
    audience: {
      type: String,
      enum: ["direct", "broadcast"],
      default: "direct",
    },
    broadcastId: { type: String, index: true, sparse: true },
  },
  { timestamps: true }
);

InboxThreadSchema.index({ participantUserId: 1, lastMessageAt: -1 });
InboxThreadSchema.index({ lastMessageAt: -1 });
InboxThreadSchema.index({ adminUnreadCount: 1, lastMessageAt: -1 });

export default mongoose.models?.InboxThread ??
  mongoose.model<IInboxThread>("InboxThread", InboxThreadSchema);
