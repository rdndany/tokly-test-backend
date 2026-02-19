import { emitToProject, emitToUser, emitToWorkspace } from "./index";
import type { ChatMessage } from "../services/chatService";

export function emitChatMessage(projectId: string, message: ChatMessage): void {
  emitToProject(projectId, "chat:message", message);
}

export function emitChatAssistant(projectId: string, payload: {
  content: string;
  responseTimeSeconds?: number;
  createdAt: string;
  questionnaireMetadata?: unknown;
}): void {
  emitToProject(projectId, "chat:assistant", payload);
}

export function emitProjectUpdated(projectId: string): void {
  emitToProject(projectId, "project:updated", { projectId });
}

export function emitInvitationsUpdated(userId: string): void {
  emitToUser(userId, "invitations:updated", {});
}

export function emitFoldersUpdated(payload: {
  workspaceId?: string | null;
  userId: string;
  type: "personal" | "workspace";
}): void {
  if (payload.type === "workspace" && payload.workspaceId) {
    emitToWorkspace(payload.workspaceId, "folders:updated", {});
  } else {
    emitToUser(payload.userId, "folders:updated", {});
  }
}

/** Emit when projects are created or deleted so workspace members see updates in sidebar/projects/folders */
export function emitProjectsUpdated(workspaceId: string): void {
  if (!workspaceId) return;
  emitToWorkspace(workspaceId, "projects:updated", {});
}
