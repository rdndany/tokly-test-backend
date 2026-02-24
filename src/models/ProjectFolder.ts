import mongoose, { Document, Schema } from "mongoose";

export type ProjectFolderType = "personal" | "workspace";

export interface ProjectFolderDocument extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  type: ProjectFolderType;
  userId: string;
  workspaceId?: mongoose.Types.ObjectId | null;
  parentFolderId?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const projectFolderSchema = new Schema<ProjectFolderDocument>(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, enum: ["personal", "workspace"] },
    userId: { type: String, required: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", default: null, index: true },
    parentFolderId: {
      type: Schema.Types.ObjectId,
      ref: "ProjectFolder",
      default: null,
    },
  },
  { timestamps: true }
);

projectFolderSchema.index({ workspaceId: 1, type: 1 });
projectFolderSchema.index({ workspaceId: 1, userId: 1 });

const ProjectFolderModel = mongoose.model<ProjectFolderDocument>(
  "ProjectFolder",
  projectFolderSchema
);
export default ProjectFolderModel;
