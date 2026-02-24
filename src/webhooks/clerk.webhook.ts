import { Webhook } from "svix";
import { Request, Response, RequestHandler } from "express";
import { createClerkClient } from "@clerk/clerk-sdk-node";
import config from "../config";
import UserModel, { UserDocument } from "../models/User";
import { processPendingInvitationsForEmail } from "../services/workspaceInvitationService";
import { ensurePersonalWorkspace } from "../services/workspaceService";
import { deleteUserData } from "../services/deleteUserDataService";
import { emitMembersUpdated, emitWorkspacesUpdated } from "../socket/events";
import { createLogger } from "../utils/logger";

const logger = createLogger("ClerkWebhook");

const clerkClient = config.clerk.secretKey
  ? createClerkClient({ secretKey: config.clerk.secretKey })
  : null;

function getNow(): Date {
  return new Date();
}

function getName(data: { first_name?: string; last_name?: string; id: string }): string {
  const parts = [data.first_name, data.last_name].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(" ").trim() : data.id;
}

function getEmail(data: { email_addresses?: { email_address: string }[] }): string | undefined {
  return data.email_addresses?.[0]?.email_address;
}

export const clerkWebhooks: RequestHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const svixId = req.headers["svix-id"] as string | undefined;
    const svixTimestamp = req.headers["svix-timestamp"] as string | undefined;
    const svixSignature = req.headers["svix-signature"] as string | undefined;

    if (!svixId || !svixTimestamp || !svixSignature) {
      res.status(400).json({ error: "Missing Svix headers" });
      return;
    }

    if (!config.clerk.webhookSecret) {
      res.status(500).json({ error: "Webhook secret not configured" });
      return;
    }

    const rawBody = (req as Request & { body: Buffer }).body;
    const bodyStr = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");

    const whook = new Webhook(config.clerk.webhookSecret);
    whook.verify(bodyStr, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });

    const payload = JSON.parse(bodyStr);
    const { type, data } = payload;

    switch (type) {
      case "user.created": {
        const existingById = await UserModel.findOne({ _id: data.id });
        if (existingById) {
          res.status(200).json({ success: true });
          return;
        }

        const email = getEmail(data);
        if (email) {
          const existingByEmail = await UserModel.findOne({ email });
          if (existingByEmail) {
            res.status(200).json({ success: true });
            return;
          }
        }

        const now = getNow();
        await UserModel.create({
          _id: data.id,
          email: email ?? undefined,
          name: getName(data),
          image: data.image_url ?? undefined,
          role: "user",
          createdAt: now,
          updatedAt: now,
        });

        if (email) {
          try {
            const { count, workspaceIds } = await processPendingInvitationsForEmail(email, data.id);
            if (count > 0) {
              for (const workspaceId of workspaceIds) {
                emitMembersUpdated(workspaceId);
              }
              logger.info("Auto-joined workspaces from pending invitations", {
                userId: data.id,
                email,
                count,
              });
            }
          } catch (e) {
            logger.error("Failed to process pending invitations for new user", e);
          }
        }

        try {
          const personal = await ensurePersonalWorkspace(data.id);
          if (personal) {
            emitWorkspacesUpdated(data.id);
            logger.info("Created default personal workspace for new user", {
              userId: data.id,
              workspaceId: personal.id,
            });
          }
        } catch (e) {
          logger.error("Failed to ensure personal workspace for new user", e);
        }

        if (clerkClient) {
          try {
            await clerkClient.users.updateUser(data.id, {
              publicMetadata: { role: "user" },
            });
          } catch {
            // ignore metadata update errors
          }
        }

        res.status(200).json({ success: true });
        return;
      }

      case "user.updated": {
        const clerkName = getName(data);
        const existing = await UserModel.findById(data.id).select("name fullName").lean();
        const existingFullName = (existing?.fullName as string | undefined)?.trim();
        const existingName = existing?.name as string | undefined;
        const hasRealName = existingFullName || (existingName && !existingName.startsWith("user_"));
        const name =
          typeof clerkName === "string" && clerkName.startsWith("user_") && hasRealName
            ? (existingFullName || existingName || clerkName)
            : clerkName;
        const userData: Partial<UserDocument> = {
          email: getEmail(data) ?? undefined,
          name,
          image: data.image_url ?? undefined,
          updatedAt: getNow(),
        };
        await UserModel.findByIdAndUpdate(data.id, userData);
        res.status(200).json({ success: true });
        return;
      }

      case "user.deleted": {
        try {
          await deleteUserData(data.id);
        } catch (e) {
          logger.error("Failed to cascade delete user data", { userId: data.id, error: e });
          // Still return 200 so Clerk doesn't retry; user doc may be partial
        }
        res.status(200).json({ success: true });
        return;
      }

      default:
        res.status(200).json({ success: true });
    }
  } catch (error) {
    logger.error("Clerk webhook error:", error);
    res.status(400).json({ error: "Webhook verification failed" });
  }
};

export default clerkWebhooks;
