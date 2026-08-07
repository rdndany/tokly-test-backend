import OpenAI from "openai";
import { Types } from "mongoose";
import config from "../config";
import WhatsNewEntryModel, { type IWhatsNewEntry } from "../models/WhatsNewEntry";
import UserModel from "../models/User";

const openai = config.openai.apiKey
  ? new OpenAI({ apiKey: config.openai.apiKey })
  : null;

export interface WhatsNewListItemDto {
  id: string;
  title: string;
  summary: string;
  published: boolean;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsNewDetailDto extends WhatsNewListItemDto {
  body: string;
  createdByAdminId: string;
}

export interface CreateWhatsNewPayload {
  title: string;
  body: string;
  summary?: string;
  published?: boolean;
}

export interface UpdateWhatsNewPayload {
  title?: string;
  body?: string;
  summary?: string;
  published?: boolean;
}

function fallbackSummary(body: string): string {
  const trimmed = body.trim().replace(/\s+/g, " ");
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}…` : trimmed;
}

export async function generateWhatsNewSummary(body: string): Promise<string> {
  const source = body.trim();
  if (!source) return "";

  if (!openai) {
    return fallbackSummary(source);
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You write short plain-text teasers for a product What's New feed. 1–2 sentences, maximum 160 characters. No markdown, no quotes, no emoji. Output only the summary.",
        },
        {
          role: "user",
          content: `Summarize this product update for a short list preview:\n\n${source.slice(0, 4000)}`,
        },
      ],
      max_tokens: 80,
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!text) return fallbackSummary(source);
    return text.length > 160 ? `${text.slice(0, 157)}…` : text;
  } catch {
    return fallbackSummary(source);
  }
}

function toListDto(doc: IWhatsNewEntry | Record<string, unknown>): WhatsNewListItemDto {
  const d = doc as IWhatsNewEntry;
  return {
    id: String(d._id),
    title: d.title,
    summary: d.summary,
    published: Boolean(d.published),
    publishedAt: d.publishedAt ? new Date(d.publishedAt).toISOString() : undefined,
    createdAt: new Date(d.createdAt).toISOString(),
    updatedAt: new Date(d.updatedAt).toISOString(),
  };
}

function toDetailDto(doc: IWhatsNewEntry | Record<string, unknown>): WhatsNewDetailDto {
  const d = doc as IWhatsNewEntry;
  return {
    ...toListDto(d),
    body: d.body,
    createdByAdminId: d.createdByAdminId,
  };
}

export async function listAllForAdmin(): Promise<WhatsNewDetailDto[]> {
  const docs = await WhatsNewEntryModel.find()
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  return docs.map((d) => toDetailDto(d as unknown as IWhatsNewEntry));
}

export async function listPublishedForUser(): Promise<WhatsNewListItemDto[]> {
  const docs = await WhatsNewEntryModel.find({ published: true })
    .sort({ publishedAt: -1, createdAt: -1 })
    .limit(100)
    .lean();
  return docs.map((d) => toListDto(d as unknown as IWhatsNewEntry));
}

export async function getPublishedById(
  id: string
): Promise<WhatsNewDetailDto | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const doc = await WhatsNewEntryModel.findOne({
    _id: id,
    published: true,
  }).lean();
  if (!doc) return null;
  return toDetailDto(doc as unknown as IWhatsNewEntry);
}

export async function createEntry(
  adminUserId: string,
  payload: CreateWhatsNewPayload
): Promise<WhatsNewDetailDto> {
  const title = payload.title?.trim();
  const body = payload.body?.trim();
  if (!title) throw new Error("Title is required");
  if (!body) throw new Error("Description is required");
  if (title.length > 200) throw new Error("Title is too long");
  if (body.length > 20000) throw new Error("Description is too long");

  const summary = payload.summary?.trim()
    ? payload.summary.trim().slice(0, 280)
    : await generateWhatsNewSummary(body);
  if (!summary) throw new Error("Could not generate a short summary");

  const published = Boolean(payload.published);
  const doc = await WhatsNewEntryModel.create({
    title,
    body,
    summary,
    published,
    publishedAt: published ? new Date() : undefined,
    createdByAdminId: adminUserId,
  });

  return toDetailDto(doc);
}

export async function updateEntry(
  id: string,
  payload: UpdateWhatsNewPayload
): Promise<WhatsNewDetailDto | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const doc = await WhatsNewEntryModel.findById(id);
  if (!doc) return null;

  const bodyChanged =
    payload.body !== undefined && payload.body.trim() !== doc.body;
  const summaryExplicitlyProvided =
    payload.summary !== undefined && payload.summary.trim().length > 0;

  if (payload.title !== undefined) {
    const title = payload.title.trim();
    if (!title) throw new Error("Title is required");
    if (title.length > 200) throw new Error("Title is too long");
    doc.title = title;
  }

  if (payload.body !== undefined) {
    const body = payload.body.trim();
    if (!body) throw new Error("Description is required");
    if (body.length > 20000) throw new Error("Description is too long");
    doc.body = body;
  }

  if (summaryExplicitlyProvided) {
    doc.summary = payload.summary!.trim().slice(0, 280);
  } else if (bodyChanged) {
    doc.summary = await generateWhatsNewSummary(doc.body);
  }

  if (payload.published !== undefined) {
    const next = Boolean(payload.published);
    if (next && !doc.published) {
      doc.publishedAt = new Date();
    }
    if (!next) {
      doc.publishedAt = undefined;
    }
    doc.published = next;
  }

  await doc.save();
  return toDetailDto(doc);
}

export async function deleteEntry(id: string): Promise<boolean> {
  if (!Types.ObjectId.isValid(id)) return false;
  const result = await WhatsNewEntryModel.findByIdAndDelete(id);
  return Boolean(result);
}

export async function getUnreadCount(userId: string): Promise<number> {
  const user = await UserModel.findById(userId)
    .select("whatsNewLastSeenAt")
    .lean();
  const lastSeen = user?.whatsNewLastSeenAt
    ? new Date(user.whatsNewLastSeenAt)
    : null;

  const filter: Record<string, unknown> = { published: true };
  if (lastSeen) {
    filter.publishedAt = { $gt: lastSeen };
  }

  return WhatsNewEntryModel.countDocuments(filter);
}

export async function markSeen(userId: string): Promise<void> {
  await UserModel.findByIdAndUpdate(userId, {
    whatsNewLastSeenAt: new Date(),
  });
}

export async function regenerateSummaryForEntry(
  id: string
): Promise<WhatsNewDetailDto | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const doc = await WhatsNewEntryModel.findById(id);
  if (!doc) return null;
  doc.summary = await generateWhatsNewSummary(doc.body);
  await doc.save();
  return toDetailDto(doc);
}
