import DailyStats from "../models/DailyStats";
import { createLogger } from "../utils/logger";

const logger = createLogger("DailyStatsService");

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

export interface TodayStats {
  date: string;
  viewCount: number;
  uniqueVisitors: number;
}

export interface StatsData {
  date: string;
  viewCount: number;
  uniqueVisitors: number;
}

export async function incrementView(projectId: string, visitorId: string): Promise<void> {
  try {
    const date = getTodayDate();
    await DailyStats.findOneAndUpdate(
      { projectId, date },
      {
        $inc: { viewCount: 1 },
        $addToSet: { uniqueVisitorIds: visitorId },
        $set: { lastUpdated: new Date() },
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    logger.error("Error incrementing view", err);
  }
}

interface DailyStatsDoc {
  date: string;
  viewCount: number;
  uniqueVisitorIds?: string[];
}

export async function getTodayStats(projectId: string): Promise<TodayStats> {
  try {
    const date = getTodayDate();
    const doc = await DailyStats.findOne({ projectId, date }).lean() as DailyStatsDoc | null;
    if (!doc) {
      return { date, viewCount: 0, uniqueVisitors: 0 };
    }
    const ids = doc.uniqueVisitorIds ?? [];
    return {
      date: doc.date,
      viewCount: doc.viewCount ?? 0,
      uniqueVisitors: Array.isArray(ids) ? ids.length : 0,
    };
  } catch (err) {
    logger.error("Error getting today stats", err);
    return { date: getTodayDate(), viewCount: 0, uniqueVisitors: 0 };
  }
}

export async function getStatsRange(
  projectId: string,
  startDate: string,
  endDate: string
): Promise<StatsData[]> {
  try {
    const docs = await DailyStats.find({
      projectId,
      date: { $gte: startDate, $lte: endDate },
    })
      .sort({ date: 1 })
      .lean() as unknown as DailyStatsDoc[];

    return docs.map((d) => {
      const ids = d.uniqueVisitorIds ?? [];
      return {
        date: d.date,
        viewCount: d.viewCount ?? 0,
        uniqueVisitors: Array.isArray(ids) ? ids.length : 0,
      };
    });
  } catch (err) {
    logger.error("Error getting stats range", err);
    return [];
  }
}

export async function getTotalStats(
  projectId: string,
  startDate?: string,
  endDate?: string
): Promise<{ totalViews: number; totalUniqueVisitors: number }> {
  try {
    const match: Record<string, unknown> = { projectId };
    if (startDate && endDate) match.date = { $gte: startDate, $lte: endDate };
    else if (startDate) match.date = { $gte: startDate };
    else if (endDate) match.date = { $lte: endDate };

    const result = await DailyStats.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalViews: { $sum: "$viewCount" },
          allVisitorIds: { $push: "$uniqueVisitorIds" },
        },
      },
    ]);

    if (!result?.length) {
      return { totalViews: 0, totalUniqueVisitors: 0 };
    }

    const allIds = (result[0].allVisitorIds ?? []) as string[][];
    const set = new Set<string>();
    for (const arr of allIds) {
      if (Array.isArray(arr)) arr.forEach((id) => set.add(id));
    }
    return {
      totalViews: result[0].totalViews ?? 0,
      totalUniqueVisitors: set.size,
    };
  } catch (err) {
    logger.error("Error getting total stats", err);
    return { totalViews: 0, totalUniqueVisitors: 0 };
  }
}
