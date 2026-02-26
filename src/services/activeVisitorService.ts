import ActiveVisitor from "../models/ActiveVisitor";
import { getProjectById } from "./projectService";
import { createLogger } from "../utils/logger";

const logger = createLogger("ActiveVisitorService");

/** Consider a visitor "active" if lastSeenAt is within this many ms. */
const ACTIVE_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

export async function recordPresence(projectId: string, visitorId: string): Promise<void> {
  try {
    const project = await getProjectById(projectId);
    if (project?.analyticsDisabled) return;
    await ActiveVisitor.findOneAndUpdate(
      { projectId, visitorId },
      { $set: { lastSeenAt: new Date() } },
      { upsert: true, new: true }
    );
  } catch (err) {
    logger.error?.("Error recording presence", err);
  }
}

export async function getActiveCount(projectId: string): Promise<number> {
  try {
    const since = new Date(Date.now() - ACTIVE_WINDOW_MS);
    const count = await ActiveVisitor.countDocuments({
      projectId,
      lastSeenAt: { $gt: since },
    });
    return count;
  } catch (err) {
    logger.error?.("Error getting active count", err);
    return 0;
  }
}
