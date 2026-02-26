import mongoose, { Document, Schema } from "mongoose";

/**
 * Tracks visitors currently on a project page. lastSeenAt is updated by heartbeat.
 * "Active" = lastSeenAt within last 2 minutes. TTL index removes docs after 10 min.
 */
export interface IActiveVisitor extends Document {
  projectId: string;
  visitorId: string;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ActiveVisitorSchema = new Schema<IActiveVisitor>(
  {
    projectId: { type: String, required: true, index: true },
    visitorId: { type: String, required: true, index: true },
    lastSeenAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

ActiveVisitorSchema.index({ projectId: 1, visitorId: 1 }, { unique: true });
// Remove documents 10 min after lastSeenAt so collection doesn't grow unbounded
ActiveVisitorSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: 600 });

export default mongoose.models?.ActiveVisitor ?? mongoose.model<IActiveVisitor>("ActiveVisitor", ActiveVisitorSchema);
