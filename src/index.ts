import http from "http";
import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { logger } from "./utils/logger";
import { clerkMiddleware } from "@clerk/express";
import connectDatabase from "./config/database";
import config from "./config";
import { initializeResend } from "./services/emailService";
import { initSocket } from "./socket";
import clerkWebhooks from "./webhooks/clerk.webhook";
import onboardingRoutes from "./routes/onboardingRoutes";
import userRoutes from "./routes/userRoutes";
import projectRoutes from "./routes/projectRoutes";
import workspaceRoutes from "./routes/workspaceRoutes";
import invitationRoutes from "./routes/invitationRoutes";
import uploadRoutes from "./routes/uploadRoutes";
import projectFolderRoutes from "./routes/projectFolderRoutes";
import stripeRoutes from "./routes/stripeRoutes";
import adminRoutes from "./routes/adminRoutes";
import announcementRoutes from "./routes/announcementRoutes";
import affiliateRoutes from "./routes/affiliateRoutes";
import dailyStatsRoutes from "./routes/dailyStatsRoutes";
import ga4Routes from "./routes/ga4Routes";
import partnerRoutes from "./routes/partnerRoutes";
import inboxRoutes from "./routes/inboxRoutes";
import { stripeWebhook } from "./controllers/StripeController";
import { startTokenUpdateCron } from "./services/cronService";

dotenv.config();

initializeResend();

const app = express();
const httpServer = http.createServer(app);
const PORT = config.port;

app.use(
  cors({
    origin: true,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);

/* Webhooks must use raw body for signature verification */
app.post(
  "/webhooks/clerk",
  express.raw({ type: "application/json" }),
  clerkWebhooks
);
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook
);

app.use(express.json({ limit: "2mb" }));
app.use(clerkMiddleware());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, message: "Tokly backend" });
});

app.use("/api/users", onboardingRoutes);
app.use("/api/users", userRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/workspaces", workspaceRoutes);
app.use("/api/invitations", invitationRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/folders", projectFolderRoutes);
app.use("/api/stripe", stripeRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/affiliate", affiliateRoutes);
app.use("/api/stats", dailyStatsRoutes);
app.use("/api/ga4", ga4Routes);
app.use("/api/partners", partnerRoutes);
app.use("/api/inbox", inboxRoutes);

const start = async () => {
  await connectDatabase();
  startTokenUpdateCron();
  initSocket(httpServer);
  if (config.resend.apiKey) {
    logger.info("Resend email service initialized");
  }
  httpServer.listen(PORT, () => {
    logger.info(`Server running at http://localhost:${PORT}`);
  });
};

start().catch((err) => {
  logger.error("Failed to start:", err);
  process.exit(1);
});
