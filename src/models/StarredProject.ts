import mongoose, { Document, Schema } from "mongoose";

export interface StarredProjectDocument extends Document {
  _id: mongoose.Types.ObjectId;
  userId: string;
  projectId: mongoose.Types.ObjectId;
  createdAt: Date;
}

const starredProjectSchema = new Schema<StarredProjectDocument>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
  },
  { timestamps: { updatedAt: false } }
);

starredProjectSchema.index({ userId: 1, projectId: 1 }, { unique: true });

const StarredProjectModel = mongoose.model<StarredProjectDocument>(
  "StarredProject",
  starredProjectSchema
);
export default StarredProjectModel;
