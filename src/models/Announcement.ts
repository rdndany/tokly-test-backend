import mongoose, { Document, Schema } from "mongoose";

export type AnnouncementVariant = "warning" | "info" | "success";

export interface IAnnouncement extends Document {
  message: string;
  linkText?: string;
  linkHref?: string;
  variant: AnnouncementVariant;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AnnouncementSchema = new Schema<IAnnouncement>(
  {
    message: { type: String, required: true, trim: true },
    linkText: { type: String, trim: true, default: undefined },
    linkHref: { type: String, trim: true, default: undefined },
    variant: {
      type: String,
      enum: ["warning", "info", "success"],
      default: "warning",
    },
    active: { type: Boolean, default: false },
  },
  { timestamps: true }
);

AnnouncementSchema.index({ active: 1 });
AnnouncementSchema.index({ createdAt: -1 });

export default mongoose.models?.Announcement ??
  mongoose.model<IAnnouncement>("Announcement", AnnouncementSchema);
