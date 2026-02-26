import AnnouncementModel from "../models/Announcement";
import type { AnnouncementVariant } from "../models/Announcement";

export interface AnnouncementPayload {
  message: string;
  linkText?: string;
  linkHref?: string;
  variant?: AnnouncementVariant;
  active?: boolean;
}

export interface AnnouncementDto {
  id: string;
  message: string;
  linkText?: string;
  linkHref?: string;
  variant: AnnouncementVariant;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Shape of a lean announcement document from MongoDB */
interface AnnouncementLean {
  _id: unknown;
  message: string;
  linkText?: string;
  linkHref?: string;
  variant: AnnouncementVariant;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toDto(doc: AnnouncementLean): AnnouncementDto {
  return {
    id: String(doc._id),
    message: doc.message,
    linkText: doc.linkText,
    linkHref: doc.linkHref,
    variant: doc.variant,
    active: doc.active,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** Get the single active announcement for public display (most recently updated active one). */
export async function getActiveAnnouncement(): Promise<{
  message: string;
  linkText?: string;
  linkHref?: string;
  variant: AnnouncementVariant;
} | null> {
  const doc = await AnnouncementModel.findOne({ active: true })
    .sort({ updatedAt: -1 })
    .lean()
    .exec() as AnnouncementLean | null;
  if (!doc) return null;
  return {
    message: doc.message,
    linkText: doc.linkText,
    linkHref: doc.linkHref,
    variant: doc.variant,
  };
}

export async function listAnnouncements(): Promise<AnnouncementDto[]> {
  const docs = (await AnnouncementModel.find()
    .sort({ updatedAt: -1 })
    .lean()
    .exec()) as unknown as AnnouncementLean[];
  return docs.map((d) => toDto(d));
}

export async function createAnnouncement(payload: AnnouncementPayload): Promise<AnnouncementDto> {
  if (payload.active) {
    await AnnouncementModel.updateMany({}, { $set: { active: false } });
  }
  const doc = await AnnouncementModel.create({
    message: payload.message,
    linkText: payload.linkText,
    linkHref: payload.linkHref,
    variant: payload.variant ?? "warning",
    active: payload.active ?? false,
  });
  const plain = doc.toObject() as AnnouncementLean;
  return toDto(plain);
}

export async function updateAnnouncement(
  id: string,
  payload: Partial<AnnouncementPayload>
): Promise<AnnouncementDto | null> {
  if (payload.active === true) {
    await AnnouncementModel.updateMany({ _id: { $ne: id } }, { $set: { active: false } });
  }
  const doc = (await AnnouncementModel.findByIdAndUpdate(
    id,
    { $set: payload },
    { new: true }
  )
    .lean()
    .exec()) as AnnouncementLean | null;
  if (!doc) return null;
  return toDto(doc);
}

export async function deleteAnnouncement(id: string): Promise<boolean> {
  const result = await AnnouncementModel.findByIdAndDelete(id);
  return result != null;
}
