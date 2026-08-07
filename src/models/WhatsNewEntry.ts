import mongoose, { Document, Schema } from "mongoose";

export interface IWhatsNewEntry extends Document {
  title: string;
  body: string;
  summary: string;
  published: boolean;
  publishedAt?: Date;
  createdByAdminId: string;
  createdAt: Date;
  updatedAt: Date;
}

const WhatsNewEntrySchema = new Schema<IWhatsNewEntry>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, trim: true, maxlength: 20000 },
    summary: { type: String, required: true, trim: true, maxlength: 280 },
    published: { type: Boolean, default: false, index: true },
    publishedAt: { type: Date, index: true },
    createdByAdminId: { type: String, required: true },
  },
  { timestamps: true }
);

WhatsNewEntrySchema.index({ published: 1, publishedAt: -1 });
WhatsNewEntrySchema.index({ createdAt: -1 });

export default mongoose.models?.WhatsNewEntry ??
  mongoose.model<IWhatsNewEntry>("WhatsNewEntry", WhatsNewEntrySchema);
