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
  /** When set, frontend should show this questionnaire (inferred from AI response) */
  requestQuestionnaire?: ChatMessage["requestQuestionnaire"];
}): void {
  emitToProject(projectId, "chat:assistant", payload);
}

export function emitProjectUpdated(projectId: string): void {
  emitToProject(projectId, "project:updated", { projectId });
}

export function emitInvitationsUpdated(userId: string): void {
  emitToUser(userId, "invitations:updated", {});
}

/** Emit when the user is added to a workspace (e.g. auto-accept) so the client refetches workspace list. */
export function emitWorkspacesUpdated(userId: string): void {
  emitToUser(userId, "workspaces:updated", {});
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

/** Emit when workspace members list or roles change so clients can refetch members. */
export function emitMembersUpdated(workspaceId: string): void {
  if (!workspaceId) return;
  emitToWorkspace(workspaceId, "members:updated", {});
}
