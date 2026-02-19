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
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", default: null },
    parentFolderId: {
      type: Schema.Types.ObjectId,
      ref: "ProjectFolder",
      default: null,
    },
  },
  { timestamps: true }
);

const ProjectFolderModel = mongoose.model<ProjectFolderDocument>(
  "ProjectFolder",
  projectFolderSchema
);
export default ProjectFolderModel;
