import mongoose, { Document, Schema } from "mongoose";

/**
 * One document per project per day. Stores view count and unique visitor IDs for the day.
 */
export interface IDailyStats extends Document {
  projectId: string;
  date: string; // YYYY-MM-DD
  viewCount: number;
  uniqueVisitorIds: string[];
  lastUpdated: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DailyStatsSchema = new Schema<IDailyStats>(
  {
    projectId: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },
    viewCount: { type: Number, default: 0 },
    uniqueVisitorIds: { type: [String], default: [] },
    lastUpdated: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

DailyStatsSchema.index({ projectId: 1, date: 1 }, { unique: true });
DailyStatsSchema.index({ projectId: 1, date: -1 });

export default mongoose.models?.DailyStats ?? mongoose.model<IDailyStats>("DailyStats", DailyStatsSchema);
