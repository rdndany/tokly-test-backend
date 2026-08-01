import { createClerkClient } from "@clerk/clerk-sdk-node";
import config from "../config";
import UserModel from "../models/User";
import { createLogger } from "../utils/logger";

const logger = createLogger("OnboardingService");

const clerkClient = config.clerk.secretKey
  ? createClerkClient({ secretKey: config.clerk.secretKey })
  : null;

/** Handle: 3–30 chars, lowercase letters, numbers, underscore only */
export const HANDLE_REGEX = /^[a-z0-9_]{3,30}$/;

function getNow(): Date {
  return new Date();
}

export type CheckHandleResult =
  | { available: true }
  | { available: false; message: string };

export async function checkHandleAvailability(
  handle: string,
  currentUserId?: string
): Promise<CheckHandleResult> {
  const normalized = handle.trim().toLowerCase();
  if (!normalized) {
    return { available: false, message: "Handle is required" };
  }
  if (!HANDLE_REGEX.test(normalized)) {
    return {
      available: false,
      message:
        "Handle must be 3–30 characters, letters, numbers, and underscores only",
    };
  }
  // Only match users that actually have a non-empty handle set (ignore missing/null/empty)
  const query = {
    handle: {
      $exists: true,
      $nin: [null, ""],
      $eq: normalized,
    },
  };
  logger.debug("[checkHandle] normalized:", JSON.stringify(normalized), "currentUserId:", currentUserId ?? "(none)");
  logger.debug("[checkHandle] query:", JSON.stringify(query));

  const allWithHandle = await UserModel.find({ handle: { $exists: true } }).select("_id handle").lean();
  logger.debug("[checkHandle] all users with handle field:", JSON.stringify(allWithHandle));

  const existing = await UserModel.findOne(query);

  if (existing) {
    logger.debug("[checkHandle] found existing user _id:", existing._id, "handle:", existing.handle, "handle type:", typeof existing.handle);
    logger.debug("[checkHandle] currentUserId === existing._id?", currentUserId === existing._id?.toString(), "currentUserId:", currentUserId, "existing._id:", existing._id?.toString());
  } else {
    logger.debug("[checkHandle] no user found with this handle, returning available");
  }

  if (!existing) {
    return { available: true };
  }
  if (currentUserId && existing._id.toString() === currentUserId) {
    return { available: true };
  }
  return { available: false, message: "This handle is already taken" };
}

export type OnboardingData = {
  fullName?: string;
  companyRole?: string;
  companySize?: string;
  theme?: "light" | "dark" | "system";
  handle?: string;
  autoAcceptInvitations?: boolean;
};

export async function completeOnboarding(
  userId: string,
  data: OnboardingData
): Promise<void> {
  const { fullName, companyRole, companySize, theme, handle, autoAcceptInvitations } = data;

  if (handle && !HANDLE_REGEX.test(handle)) {
    throw new Error("Invalid handle format");
  }
  if (handle) {
    const taken = await UserModel.findOne({ handle, _id: { $ne: userId } });
    if (taken) {
      throw new Error("This handle is already taken");
    }
  }

  const update: Record<string, unknown> = { updatedAt: getNow() };
  if (fullName !== undefined) {
    const trimmedFullName = fullName.trim();
    update.fullName = trimmedFullName;
    if (trimmedFullName) update.name = trimmedFullName;
  }
  if (companyRole !== undefined) update.companyRole = companyRole;
  if (companySize !== undefined) update.companySize = companySize;
  if (theme) update.theme = theme;
  if (handle !== undefined) update.handle = handle;
  if (autoAcceptInvitations !== undefined) update.autoAcceptInvitations = autoAcceptInvitations;

  // If display name is still the Clerk user id (e.g. "user_3A7L..."), set name to fullName (from payload or existing)
  const current = await UserModel.findById(userId).select("name fullName").lean();
  const currentName = current?.name as string | undefined;
  const currentFullName = (current?.fullName as string | undefined)?.trim();
  if (typeof currentName === "string" && currentName.startsWith("user_")) {
    const nameToUse = (typeof fullName === "string" && fullName.trim()) ? fullName.trim() : currentFullName;
    if (nameToUse) update.name = nameToUse;
  }

  await UserModel.findByIdAndUpdate(userId, update);

  if (clerkClient) {
    try {
      const user = await clerkClient.users.getUser(userId);
      const existing = (user.publicMetadata ?? {}) as Record<string, unknown>;
      await clerkClient.users.updateUser(userId, {
        publicMetadata: {
          ...existing,
          onboardingCompleted: true,
          ...(handle && { handle }),
          ...(fullName && { fullName }),
        },
      });
    } catch {
      // continue; user is updated in DB
    }
  }
}
