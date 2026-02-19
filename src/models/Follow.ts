import mongoose, { Document, Schema } from "mongoose";

export interface FollowDocument extends Document {
  followerId: string;
  followingId: string;
  createdAt: Date;
}

const followSchema = new Schema<FollowDocument>(
  {
    followerId: { type: String, required: true, index: true },
    followingId: { type: String, required: true, index: true },
  },
  { timestamps: true }
);

followSchema.index({ followerId: 1, followingId: 1 }, { unique: true });

const FollowModel = mongoose.model<FollowDocument>("Follow", followSchema);
export default FollowModel;
