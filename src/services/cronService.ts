import cron from "node-cron";
import { updateAllProjectsTokenData } from "./projectService";
import { createLogger } from "../utils/logger";

const logger = createLogger("CronService");

let isTokenUpdateRunning = false;

/**
 * Start cron that updates token details (price, marketCap, etc.) for all projects every 5 minutes.
 */
export function startTokenUpdateCron(): void {
  cron.schedule("*/5 * * * *", async () => {
    if (isTokenUpdateRunning) {
      logger.info("Token update cron skipped: previous run still in progress");
      return;
    }
    isTokenUpdateRunning = true;
    try {
      logger.info("Token update cron: starting");
      await updateAllProjectsTokenData();
      logger.info("Token update cron: finished");
    } catch (err) {
      logger.error("Token update cron error:", err);
    } finally {
      isTokenUpdateRunning = false;
    }
  });
  logger.info("Token update cron scheduled (every 5 minutes)");
}
