import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { createClerkClient } from "@clerk/clerk-sdk-node";
import config from "../config";
import { createLogger } from "../utils/logger";
import { ensureUserCanAccessWorkspace } from "../services/workspaceService";
import { getProjectById } from "../services/projectService";
import UserModel from "../models/User";

const logger = createLogger("Socket");

let io: Server | null = null;

export type PresenceUser = {
  id: string;
  name: string;
  image?: string;
  handle?: string;
};

async function broadcastPresenceToProject(projectId: string): Promise<void> {
  if (!io) return;
  const room = io.sockets.adapter.rooms.get(`project:${projectId}`);
  if (!room || room.size === 0) return;

  const userIds = new Set<string>();
  for (const socketId of room) {
    const s = io.sockets.sockets.get(socketId);
    const uid = s?.data?.userId as string | undefined;
    if (uid) userIds.add(uid);
  }

  if (userIds.size === 0) return;

  const users = await UserModel.find({ _id: { $in: [...userIds] } })
    .lean();

  const presence: PresenceUser[] = users.map((u) => ({
    id: u._id,
    name: u.fullName || u.name || "Unknown",
    image: u.image,
    handle: u.handle,
  }));

  io.to(`project:${projectId}`).emit("project:presence", { users: presence });
}

const clerkClient = config.clerk.secretKey
  ? createClerkClient({ secretKey: config.clerk.secretKey })
  : null;

export function getIO(): Server {
  if (!io) throw new Error("Socket.IO not initialized");
  return io;
}

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
    path: "/socket.io",
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token?.trim()) {
      next(new Error("Unauthorized"));
      return;
    }
    if (!clerkClient) {
      next(new Error("Auth not configured"));
      return;
    }
    try {
      const payload = await clerkClient.verifyToken(token, {
        issuer: (iss) =>
          typeof iss === "string" &&
          (iss.startsWith("https://clerk.") || iss.includes(".clerk.accounts")),
      });
      const userId = payload.sub;
      if (!userId) {
        next(new Error("Invalid token"));
        return;
      }
      socket.data.userId = userId;
      next();
    } catch (err) {
      logger.warn("Socket auth failed:", err);
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const userId = socket.data.userId as string;
    logger.info("Socket connected", { userId: userId?.slice(0, 8) });

    // Join user-specific room for receiving personal events (e.g. invitations)
    if (userId) {
      void socket.join(`user:${userId}`);
    }

    socket.on("join_project", async (projectId: string) => {
      if (!projectId || typeof projectId !== "string") return;
      try {
        const project = await getProjectById(projectId);
        if (!project) {
          socket.emit("error", { message: "Project not found" });
          return;
        }
        const workspaceId = project.workspaceId?.toString();
        if (!workspaceId) {
          socket.emit("error", { message: "Project has no workspace" });
          return;
        }
        const canAccess = await ensureUserCanAccessWorkspace(userId, workspaceId);
        if (!canAccess) {
          socket.emit("error", { message: "Access denied" });
          return;
        }
        const room = `project:${projectId}`;
        await socket.join(room);
        const projectIds = (socket.data.projectIds as string[]) ?? [];
        if (!projectIds.includes(projectId)) projectIds.push(projectId);
        socket.data.projectIds = projectIds;
        logger.debug("Joined project room", { userId: userId?.slice(0, 8), projectId });
        await broadcastPresenceToProject(projectId);
      } catch (err) {
        logger.error("join_project error:", err);
        socket.emit("error", { message: "Failed to join" });
      }
    });

    socket.on("leave_project", async (projectId: string) => {
      if (projectId) {
        socket.leave(`project:${projectId}`);
        const projectIds = ((socket.data.projectIds as string[]) ?? []).filter(
          (id) => id !== projectId
        );
        socket.data.projectIds = projectIds;
        await broadcastPresenceToProject(projectId);
      }
    });

    socket.on("join_workspace", async (workspaceId: string) => {
      if (!workspaceId || typeof workspaceId !== "string") return;
      try {
        const canAccess = await ensureUserCanAccessWorkspace(userId, workspaceId);
        if (!canAccess) {
          socket.emit("error", { message: "Access denied to workspace" });
          return;
        }
        const room = `workspace:${workspaceId}`;
        await socket.join(room);
        const ids = (socket.data.workspaceIds as string[]) ?? [];
        if (!ids.includes(workspaceId)) ids.push(workspaceId);
        socket.data.workspaceIds = ids;
        logger.debug("Joined workspace room", { userId: userId?.slice(0, 8), workspaceId });
      } catch (err) {
        logger.error("join_workspace error:", err);
        socket.emit("error", { message: "Failed to join workspace" });
      }
    });

    socket.on("leave_workspace", (workspaceId: string) => {
      if (workspaceId) {
        socket.leave(`workspace:${workspaceId}`);
        const ids = ((socket.data.workspaceIds as string[]) ?? []).filter(
          (id) => id !== workspaceId
        );
        socket.data.workspaceIds = ids;
      }
    });

    socket.on("disconnect", async () => {
      logger.debug("Socket disconnected", { userId: userId?.slice(0, 8) });
      const projectIds = (socket.data.projectIds as string[]) ?? [];
      for (const projectId of projectIds) {
        await broadcastPresenceToProject(projectId);
      }
    });
  });

  logger.info("Socket.IO initialized");
  return io;
}

export function emitToProject(projectId: string, event: string, payload: unknown): void {
  if (!io) return;
  io.to(`project:${projectId}`).emit(event, payload);
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit(event, payload);
}

export function emitToWorkspace(workspaceId: string, event: string, payload: unknown): void {
  if (!io || !workspaceId) return;
  io.to(`workspace:${workspaceId}`).emit(event, payload);
}
