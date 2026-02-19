import mongoose, { Document, Schema } from "mongoose";

export interface ProjectFileDocument extends Document {
  _id: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  path: string;
  content: string;
  updatedAt: Date;
}

const projectFileSchema = new Schema<ProjectFileDocument>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    path: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      default: "",
    },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

projectFileSchema.index({ projectId: 1, path: 1 }, { unique: true });

const ProjectFileModel = mongoose.model<ProjectFileDocument>(
  "ProjectFile",
  projectFileSchema
);
export default ProjectFileModel;
