import mongoose, { Document, Schema } from "mongoose";

export interface QuestionnaireItem {
  label: string;
  completed: boolean;
}

export interface QuestionnaireMetadata {
  type: "questionnaire";
  title: string;
  items: QuestionnaireItem[];
}

export interface ProjectChatMessageDocument extends Document {
  _id: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  role: "user" | "assistant" | "system";
  userId?: string;
  content: string;
  responseTimeSeconds?: number;
  metadata?: QuestionnaireMetadata;
  createdAt: Date;
}

const projectChatMessageSchema = new Schema<ProjectChatMessageDocument>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    role: {
      type: String,
      required: true,
      enum: ["user", "assistant", "system"],
    },
    userId: {
      type: String,
      required: false,
      index: true,
    },
    content: {
      type: String,
      required: true,
      default: "",
    },
    responseTimeSeconds: {
      type: Number,
      default: undefined,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
  },
  { timestamps: { updatedAt: false } }
);

projectChatMessageSchema.index({ projectId: 1, createdAt: 1 });

const ProjectChatMessageModel = mongoose.model<ProjectChatMessageDocument>(
  "ProjectChatMessage",
  projectChatMessageSchema
);
export default ProjectChatMessageModel;
