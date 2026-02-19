import mongoose, { Document, Schema } from "mongoose";

export interface ProjectHistoryDocument extends Document {
  projectId: mongoose.Types.ObjectId;
  userId: string;
  description: string;
  section?: string;
  createdAt: Date;
}

const projectHistorySchema = new Schema<ProjectHistoryDocument>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    section: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

projectHistorySchema.index({ projectId: 1, createdAt: -1 });

const ProjectHistoryModel = mongoose.model<ProjectHistoryDocument>(
  "ProjectHistory",
  projectHistorySchema
);
export default ProjectHistoryModel;
