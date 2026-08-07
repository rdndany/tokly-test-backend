import mongoose, { Document, Schema, Types } from "mongoose";

export type InboxSenderRole = "admin" | "user";

export interface IInboxMessage extends Document {
  threadId: Types.ObjectId;
  senderId: string;
  senderRole: InboxSenderRole;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

const InboxMessageSchema = new Schema<IInboxMessage>(
  {
    threadId: {
      type: Schema.Types.ObjectId,
      ref: "InboxThread",
      required: true,
      index: true,
    },
    senderId: { type: String, required: true },
    senderRole: {
      type: String,
      enum: ["admin", "user"],
      required: true,
    },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
  },
  { timestamps: true }
);

InboxMessageSchema.index({ threadId: 1, createdAt: 1 });

export default mongoose.models?.InboxMessage ??
  mongoose.model<IInboxMessage>("InboxMessage", InboxMessageSchema);
