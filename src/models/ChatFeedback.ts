import mongoose, { Document, Schema } from "mongoose";

export type FeedbackCategory =
  | "design_off"
  | "unrelated_changes"
  | "functionality_broken"
  | "other";

export interface ChatFeedbackDocument extends Document {
  _id: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  userId: string;
  userMessage: string;
  assistantMessage: string;
  feedbackType: "positive" | "negative";
  category?: FeedbackCategory;
  additionalFeedback?: string;
  createdAt: Date;
}

const chatFeedbackSchema = new Schema<ChatFeedbackDocument>(
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
    userMessage: {
      type: String,
      required: true,
    },
    assistantMessage: {
      type: String,
      required: true,
    },
    feedbackType: {
      type: String,
      required: true,
      enum: ["positive", "negative"],
    },
    category: {
      type: String,
      enum: ["design_off", "unrelated_changes", "functionality_broken", "other"],
    },
    additionalFeedback: {
      type: String,
      default: "",
    },
  },
  { timestamps: { updatedAt: false } }
);

chatFeedbackSchema.index({ projectId: 1, userId: 1 });
chatFeedbackSchema.index(
  { projectId: 1, userId: 1, userMessage: 1, assistantMessage: 1 },
  { unique: true }
);

const ChatFeedbackModel = mongoose.model<ChatFeedbackDocument>(
  "ChatFeedback",
  chatFeedbackSchema
);
export default ChatFeedbackModel;
