import mongoose, { Document, Schema } from "mongoose";

export interface WorkspaceDocument extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  avatar?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const workspaceSchema = new Schema<WorkspaceDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    avatar: {
      type: String,
      default: undefined,
    },
    createdBy: {
      type: String,
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

const WorkspaceModel = mongoose.model<WorkspaceDocument>(
  "Workspace",
  workspaceSchema
);
export default WorkspaceModel;
