import mongoose from "mongoose";
import UserModel from "../models/User";
import { getProjectById } from "./projectService";
import { ensureUserCanAccessWorkspace } from "./workspaceService";
import ChatFeedbackModel from "../models/ChatFeedback";
import type { FeedbackCategory } from "../models/ChatFeedback";

async function ensureUserCanAccessProject(
  userId: string,
  project: { userId: string; workspaceId?: { toString(): string } }
): Promise<void> {
  const { clerkClient } = await import("@clerk/express");
  const userDoc = await UserModel.findById(userId).select("role").lean();
  if (userDoc?.role === "admin") return;
  if (clerkClient) {
    try {
      const clerkUser = await clerkClient.users.getUser(userId);
      if (clerkUser.publicMetadata?.role === "admin") return;
    } catch {
      // Ignore
    }
  }

  const workspaceId = project.workspaceId?.toString();
  if (workspaceId) {
    const canAccess = await ensureUserCanAccessWorkspace(userId, workspaceId);
    if (!canAccess) throw new Error("Forbidden");
  } else if (project.userId !== userId) {
    throw new Error("Forbidden");
  }
}

export type SubmitFeedbackInput = {
  projectId: string;
  userId: string;
  userMessage: string;
  assistantMessage: string;
  feedbackType: "positive" | "negative";
  category?: FeedbackCategory;
  additionalFeedback?: string;
};

export async function submitChatFeedback(input: SubmitFeedbackInput) {
  const project = await getProjectById(input.projectId);
  if (!project) {
    throw new Error("Project not found");
  }
  await ensureUserCanAccessProject(input.userId, project);

  const filter = {
    projectId: new mongoose.Types.ObjectId(input.projectId),
    userId: input.userId,
    userMessage: input.userMessage,
    assistantMessage: input.assistantMessage,
  };

  const update: Record<string, unknown> = {
    $set: {
      feedbackType: input.feedbackType,
      ...(input.feedbackType === "negative" && {
        category: input.category,
        additionalFeedback: input.additionalFeedback?.trim() ?? "",
      }),
    },
  };
  if (input.feedbackType === "positive") {
    (update as Record<string, unknown>).$unset = {
      category: "",
      additionalFeedback: "",
    };
  }

  await ChatFeedbackModel.findOneAndUpdate(filter, update, { upsert: true });
}

export async function deleteChatFeedback(input: {
  projectId: string;
  userId: string;
  userMessage: string;
  assistantMessage: string;
}) {
  const project = await getProjectById(input.projectId);
  if (!project) {
    throw new Error("Project not found");
  }
  await ensureUserCanAccessProject(input.userId, project);

  await ChatFeedbackModel.deleteOne({
    projectId: new mongoose.Types.ObjectId(input.projectId),
    userId: input.userId,
    userMessage: input.userMessage,
    assistantMessage: input.assistantMessage,
  });
}
