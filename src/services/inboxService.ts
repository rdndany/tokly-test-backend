import { Types } from "mongoose";
import { randomUUID } from "crypto";
import InboxThreadModel, {
  type InboxAudience,
  type IInboxThread,
} from "../models/InboxThread";
import InboxMessageModel, {
  type InboxSenderRole,
  type IInboxMessage,
} from "../models/InboxMessage";
import UserModel from "../models/User";
import WorkspaceInvitationModel from "../models/WorkspaceInvitation";
import {
  emitInboxUpdated,
  emitInboxUpdatedToAdmins,
} from "../socket/events";

export interface InboxMessageDto {
  id: string;
  threadId: string;
  senderId: string;
  senderRole: InboxSenderRole;
  body: string;
  createdAt: string;
}

export interface InboxThreadListItemDto {
  id: string;
  participantUserId: string;
  participantName?: string;
  participantEmail?: string;
  participantImage?: string;
  subject: string;
  createdByAdminId: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  userUnreadCount: number;
  adminUnreadCount: number;
  audience: InboxAudience;
  broadcastId?: string;
  createdAt: string;
}

export interface InboxThreadDetailDto extends InboxThreadListItemDto {
  messages: InboxMessageDto[];
}

export interface ComposeInboxPayload {
  subject: string;
  body: string;
  userIds?: string[];
  allUsers?: boolean;
}

function previewFromBody(body: string): string {
  const trimmed = body.trim().replace(/\s+/g, " ");
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}…` : trimmed;
}

function messageToDto(msg: IInboxMessage): InboxMessageDto {
  return {
    id: String(msg._id),
    threadId: String(msg.threadId),
    senderId: msg.senderId,
    senderRole: msg.senderRole,
    body: msg.body,
    createdAt: msg.createdAt.toISOString(),
  };
}

function threadToListItem(
  thread: IInboxThread,
  user?: { name?: string; email?: string; image?: string } | null
): InboxThreadListItemDto {
  return {
    id: String(thread._id),
    participantUserId: thread.participantUserId,
    participantName: user?.name,
    participantEmail: user?.email,
    participantImage: user?.image,
    subject: thread.subject,
    createdByAdminId: thread.createdByAdminId,
    lastMessageAt: thread.lastMessageAt.toISOString(),
    lastMessagePreview: thread.lastMessagePreview,
    userUnreadCount: thread.userUnreadCount,
    adminUnreadCount: thread.adminUnreadCount,
    audience: thread.audience,
    broadcastId: thread.broadcastId,
    createdAt: thread.createdAt.toISOString(),
  };
}

async function loadUsersMap(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, { name?: string; email?: string; image?: string }>();
  const users = await UserModel.find({ _id: { $in: userIds } })
    .select("_id name email image")
    .lean();
  return new Map(
    users.map((u) => [
      String(u._id),
      { name: u.name, email: u.email, image: u.image },
    ])
  );
}

export async function composeThreads(
  adminUserId: string,
  payload: ComposeInboxPayload
): Promise<{ created: number; broadcastId?: string }> {
  const subject = payload.subject?.trim();
  const body = payload.body?.trim();
  if (!subject) throw new Error("Subject is required");
  if (!body) throw new Error("Message body is required");
  if (subject.length > 200) throw new Error("Subject is too long");
  if (body.length > 5000) throw new Error("Message body is too long");

  let recipientIds: string[] = [];
  let audience: InboxAudience = "direct";
  let broadcastId: string | undefined;

  if (payload.allUsers) {
    audience = "broadcast";
    broadcastId = randomUUID();
    const users = await UserModel.find().select("_id").lean();
    recipientIds = users.map((u) => String(u._id));
  } else {
    const raw = Array.isArray(payload.userIds) ? payload.userIds : [];
    recipientIds = [...new Set(raw.map((id) => String(id).trim()).filter(Boolean))];
    if (recipientIds.length === 0) {
      throw new Error("Select at least one user, or choose all users");
    }
    const existing = await UserModel.find({ _id: { $in: recipientIds } })
      .select("_id")
      .lean();
    const existingSet = new Set(existing.map((u) => String(u._id)));
    recipientIds = recipientIds.filter((id) => existingSet.has(id));
    if (recipientIds.length === 0) {
      throw new Error("None of the selected users were found");
    }
  }

  // Don't message yourself as the only recipient when selecting, but allow in broadcast
  if (!payload.allUsers) {
    recipientIds = recipientIds.filter((id) => id !== adminUserId);
    if (recipientIds.length === 0) {
      throw new Error("Select at least one user other than yourself");
    }
  }

  const now = new Date();
  const preview = previewFromBody(body);
  const threadsToInsert = recipientIds.map((participantUserId) => ({
    participantUserId,
    subject,
    createdByAdminId: adminUserId,
    lastMessageAt: now,
    lastMessagePreview: preview,
    userUnreadCount: 1,
    adminUnreadCount: 0,
    audience,
    broadcastId,
  }));

  const threads = await InboxThreadModel.insertMany(threadsToInsert);
  const messagesToInsert = threads.map((thread) => ({
    threadId: thread._id,
    senderId: adminUserId,
    senderRole: "admin" as const,
    body,
  }));
  await InboxMessageModel.insertMany(messagesToInsert);

  for (const userId of recipientIds) {
    emitInboxUpdated(userId);
  }
  emitInboxUpdated(adminUserId);
  void emitInboxUpdatedToAdmins();

  return { created: threads.length, broadcastId };
}

export async function listThreadsForUser(
  userId: string
): Promise<InboxThreadListItemDto[]> {
  const threads = await InboxThreadModel.find({ participantUserId: userId })
    .sort({ lastMessageAt: -1 })
    .limit(100)
    .lean();
  return threads.map((t) => threadToListItem(t as unknown as IInboxThread));
}

export async function listThreadsForAdmin(options?: {
  unreadOnly?: boolean;
}): Promise<InboxThreadListItemDto[]> {
  const filter: Record<string, unknown> = {};
  if (options?.unreadOnly) {
    filter.adminUnreadCount = { $gt: 0 };
  }
  const threads = await InboxThreadModel.find(filter)
    .sort({ lastMessageAt: -1 })
    .limit(200)
    .lean();
  const userMap = await loadUsersMap(
    threads.map((t) => t.participantUserId)
  );
  return threads.map((t) =>
    threadToListItem(
      t as unknown as IInboxThread,
      userMap.get(t.participantUserId)
    )
  );
}

async function getThreadOrThrow(threadId: string): Promise<IInboxThread> {
  if (!Types.ObjectId.isValid(threadId)) {
    throw new Error("Thread not found");
  }
  const thread = await InboxThreadModel.findById(threadId);
  if (!thread) throw new Error("Thread not found");
  return thread;
}

export async function getThreadForUser(
  userId: string,
  threadId: string
): Promise<InboxThreadDetailDto> {
  const thread = await getThreadOrThrow(threadId);
  if (thread.participantUserId !== userId) {
    throw new Error("Forbidden");
  }
  const messages = await InboxMessageModel.find({ threadId: thread._id })
    .sort({ createdAt: 1 })
    .lean();
  return {
    ...threadToListItem(thread),
    messages: messages.map((m) => messageToDto(m as unknown as IInboxMessage)),
  };
}

export async function getThreadForAdmin(
  threadId: string
): Promise<InboxThreadDetailDto> {
  const thread = await getThreadOrThrow(threadId);
  const [userMap, messages] = await Promise.all([
    loadUsersMap([thread.participantUserId]),
    InboxMessageModel.find({ threadId: thread._id }).sort({ createdAt: 1 }).lean(),
  ]);
  return {
    ...threadToListItem(thread, userMap.get(thread.participantUserId)),
    messages: messages.map((m) => messageToDto(m as unknown as IInboxMessage)),
  };
}

export async function replyAsUser(
  userId: string,
  threadId: string,
  bodyRaw: string
): Promise<InboxMessageDto> {
  const body = bodyRaw?.trim();
  if (!body) throw new Error("Message body is required");
  if (body.length > 5000) throw new Error("Message body is too long");

  const thread = await getThreadOrThrow(threadId);
  if (thread.participantUserId !== userId) {
    throw new Error("Forbidden");
  }

  const msg = await InboxMessageModel.create({
    threadId: thread._id,
    senderId: userId,
    senderRole: "user",
    body,
  });

  thread.lastMessageAt = msg.createdAt;
  thread.lastMessagePreview = previewFromBody(body);
  thread.adminUnreadCount = (thread.adminUnreadCount ?? 0) + 1;
  await thread.save();

  emitInboxUpdated(userId);
  emitInboxUpdated(thread.createdByAdminId);
  void emitInboxUpdatedToAdmins();

  return messageToDto(msg);
}

export async function replyAsAdmin(
  adminUserId: string,
  threadId: string,
  bodyRaw: string
): Promise<InboxMessageDto> {
  const body = bodyRaw?.trim();
  if (!body) throw new Error("Message body is required");
  if (body.length > 5000) throw new Error("Message body is too long");

  const thread = await getThreadOrThrow(threadId);

  const msg = await InboxMessageModel.create({
    threadId: thread._id,
    senderId: adminUserId,
    senderRole: "admin",
    body,
  });

  thread.lastMessageAt = msg.createdAt;
  thread.lastMessagePreview = previewFromBody(body);
  thread.userUnreadCount = (thread.userUnreadCount ?? 0) + 1;
  await thread.save();

  emitInboxUpdated(thread.participantUserId);
  emitInboxUpdated(adminUserId);
  void emitInboxUpdatedToAdmins();

  return messageToDto(msg);
}

export async function markThreadReadByUser(
  userId: string,
  threadId: string
): Promise<void> {
  const thread = await getThreadOrThrow(threadId);
  if (thread.participantUserId !== userId) {
    throw new Error("Forbidden");
  }
  if (thread.userUnreadCount === 0) return;
  thread.userUnreadCount = 0;
  await thread.save();
  emitInboxUpdated(userId);
}

export async function markThreadReadByAdmin(
  threadId: string
): Promise<void> {
  const thread = await getThreadOrThrow(threadId);
  if (thread.adminUnreadCount === 0) return;
  thread.adminUnreadCount = 0;
  await thread.save();
  void emitInboxUpdatedToAdmins();
}

export async function getUserUnreadSummary(userId: string): Promise<{
  unreadThreads: number;
  pendingInvitations: number;
  total: number;
}> {
  const [unreadThreads, pendingInvitations] = await Promise.all([
    InboxThreadModel.countDocuments({
      participantUserId: userId,
      userUnreadCount: { $gt: 0 },
    }),
    (async () => {
      const user = await UserModel.findById(userId).select("email").lean();
      const email = user?.email?.toLowerCase();
      if (!email) return 0;
      return WorkspaceInvitationModel.countDocuments({
        email,
        status: "pending",
        expiresAt: { $gt: new Date() },
      });
    })(),
  ]);
  return {
    unreadThreads,
    pendingInvitations,
    total: unreadThreads + pendingInvitations,
  };
}

export async function countAllUsers(): Promise<number> {
  return UserModel.countDocuments();
}
