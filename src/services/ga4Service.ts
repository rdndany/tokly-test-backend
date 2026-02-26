import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { createLogger } from "../utils/logger";

const logger = createLogger("GA4Service");

export interface DeviceStats {
  device: string;
  views: number;
  percentage: number;
}

export interface CountryStats {
  country: string;
  views: number;
}

export interface ReferrerStats {
  referrer: string;
  views: number;
}

export interface BrowserStats {
  browser: string;
  views: number;
}

export interface DailySessionStats {
  date: string; // YYYY-MM-DD
  avgSessionDuration: number;
  bounceRate: number;
}

export interface GA4AnalyticsData {
  devices: DeviceStats[];
  countries: CountryStats[];
  referrers: ReferrerStats[];
  browsers: BrowserStats[];
  avgSessionDuration: number;
  bounceRate: number;
  newVsReturning: { newUsers: number; returningUsers: number };
  dailySessionStats?: DailySessionStats[];
}

const PROJECT_ID_DIMENSION = "customEvent:project_id";

function isInvalidArgument(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: number }).code === 3
  );
}

class GA4Service {
  private client: BetaAnalyticsDataClient | null = null;
  private propertyId = "";
  private isConfigured = false;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    try {
      const credentials = process.env.GA4_CREDENTIALS;
      this.propertyId = process.env.GA4_PROPERTY_ID?.trim() ?? "";

      if (!credentials?.trim() || !this.propertyId) {
        logger.warn?.("GA4 not configured. Set GA4_CREDENTIALS and GA4_PROPERTY_ID.");
        this.isConfigured = false;
        return;
      }

      const credentialsJson = JSON.parse(credentials.trim());
      this.client = new BetaAnalyticsDataClient({ credentials: credentialsJson });
      this.isConfigured = true;
      logger.info?.("GA4 Service initialized successfully");
    } catch (err) {
      logger.error?.("Failed to initialize GA4 Service", err);
      this.isConfigured = false;
    }
  }

  public isReady(): boolean {
    return this.isConfigured && this.client !== null;
  }

  async getProjectAnalytics(
    projectId: string,
    startDate: string,
    endDate: string
  ): Promise<GA4AnalyticsData | null> {
    if (!this.isReady() || !this.client) return null;

    try {
      const [devices, countries, referrers, browsers, session, dailySession] = await Promise.all([
        this.getDeviceStats(projectId, startDate, endDate),
        this.getCountryStats(projectId, startDate, endDate),
        this.getReferrerStats(projectId, startDate, endDate),
        this.getBrowserStats(projectId, startDate, endDate),
        this.getSessionStats(projectId, startDate, endDate),
        this.getSessionStatsByDay(projectId, startDate, endDate),
      ]);

      return {
        devices,
        countries,
        referrers,
        browsers,
        avgSessionDuration: session.avgDuration,
        bounceRate: session.bounceRate,
        newVsReturning: session.newVsReturning,
        dailySessionStats: dailySession,
      };
    } catch (err) {
      logger.error?.("Error fetching GA4 analytics", err);
      return null;
    }
  }

  private projectFilter(projectId: string) {
    return {
      filter: {
        fieldName: PROJECT_ID_DIMENSION,
        stringFilter: { value: projectId },
      },
    };
  }

  private async getDeviceStats(
    projectId: string,
    startDate: string,
    endDate: string
  ): Promise<DeviceStats[]> {
    if (!this.client) return [];
    try {
      const [response] = await this.client.runReport({
        property: `properties/${this.propertyId}`,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "deviceCategory" }],
        metrics: [{ name: "screenPageViews" }],
        dimensionFilter: this.projectFilter(projectId),
      });

      const total =
        response.rows?.reduce(
          (s, row) => s + parseInt(row.metricValues?.[0]?.value ?? "0", 10),
          0
        ) || 1;

      return (
        response.rows?.map((row) => {
          const device = row.dimensionValues?.[0]?.value ?? "unknown";
          const views = parseInt(row.metricValues?.[0]?.value ?? "0", 10);
          return {
            device: device.toLowerCase(),
            views,
            percentage: Math.round((views / total) * 100),
          };
        }) ?? []
      );
    } catch (err) {
      if (isInvalidArgument(err)) {
        return this.getDeviceStatsUnfiltered(startDate, endDate);
      }
      logger.error?.("Error fetching device stats", err);
      return [];
    }
  }

  private async getDeviceStatsUnfiltered(
    startDate: string,
    endDate: string
  ): Promise<DeviceStats[]> {
    if (!this.client) return [];
    const [response] = await this.client.runReport({
      property: `properties/${this.propertyId}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "deviceCategory" }],
      metrics: [{ name: "screenPageViews" }],
    });
    const total =
      response.rows?.reduce(
        (s, row) => s + parseInt(row.metricValues?.[0]?.value ?? "0", 10),
        0
      ) || 1;
    return (
      response.rows?.map((row) => {
        const device = row.dimensionValues?.[0]?.value ?? "unknown";
        const views = parseInt(row.metricValues?.[0]?.value ?? "0", 10);
        return {
          device: device.toLowerCase(),
          views,
          percentage: Math.round((views / total) * 100),
        };
      }) ?? []
    );
  }

  private async getCountryStats(
    projectId: string,
    startDate: string,
    endDate: string
  ): Promise<CountryStats[]> {
    if (!this.client) return [];
    try {
      const [response] = await this.client.runReport({
        property: `properties/${this.propertyId}`,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "country" }],
        metrics: [{ name: "screenPageViews" }],
        dimensionFilter: this.projectFilter(projectId),
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 10,
      });
      return (
        response.rows?.map((row) => ({
          country: row.dimensionValues?.[0]?.value ?? "Unknown",
          views: parseInt(row.metricValues?.[0]?.value ?? "0", 10),
        })) ?? []
      );
    } catch (err) {
      if (isInvalidArgument(err)) {
        const [response] = await this.client.runReport({
          property: `properties/${this.propertyId}`,
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: "country" }],
          metrics: [{ name: "screenPageViews" }],
          orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
          limit: 10,
        });
        return (
          response.rows?.map((row) => ({
            country: row.dimensionValues?.[0]?.value ?? "Unknown",
            views: parseInt(row.metricValues?.[0]?.value ?? "0", 10),
          })) ?? []
        );
      }
      logger.error?.("Error fetching country stats", err);
      return [];
    }
  }

  private async getReferrerStats(
    projectId: string,
    startDate: string,
    endDate: string
  ): Promise<ReferrerStats[]> {
    if (!this.client) return [];
    try {
      const [response] = await this.client.runReport({
        property: `properties/${this.propertyId}`,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "sessionSource" }],
        metrics: [{ name: "sessions" }],
        dimensionFilter: this.projectFilter(projectId),
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 10,
      });
      return (
        response.rows?.map((row) => ({
          referrer: row.dimensionValues?.[0]?.value ?? "Direct",
          views: parseInt(row.metricValues?.[0]?.value ?? "0", 10),
        })) ?? []
      );
    } catch (err) {
      if (isInvalidArgument(err)) {
        const [response] = await this.client.runReport({
          property: `properties/${this.propertyId}`,
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: "sessionSource" }],
          metrics: [{ name: "sessions" }],
          orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
          limit: 10,
        });
        return (
          response.rows?.map((row) => ({
            referrer: row.dimensionValues?.[0]?.value ?? "Direct",
            views: parseInt(row.metricValues?.[0]?.value ?? "0", 10),
          })) ?? []
        );
      }
      logger.error?.("Error fetching referrer stats", err);
      return [];
    }
  }

  private async getBrowserStats(
    projectId: string,
    startDate: string,
    endDate: string
  ): Promise<BrowserStats[]> {
    if (!this.client) return [];
    try {
      const [response] = await this.client.runReport({
        property: `properties/${this.propertyId}`,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "browser" }],
        metrics: [{ name: "screenPageViews" }],
        dimensionFilter: this.projectFilter(projectId),
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 5,
      });
      return (
        response.rows?.map((row) => ({
          browser: row.dimensionValues?.[0]?.value ?? "Unknown",
          views: parseInt(row.metricValues?.[0]?.value ?? "0", 10),
        })) ?? []
      );
    } catch (err) {
      if (isInvalidArgument(err)) {
        const [response] = await this.client.runReport({
          property: `properties/${this.propertyId}`,
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: "browser" }],
          metrics: [{ name: "screenPageViews" }],
          orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
          limit: 5,
        });
        return (
          response.rows?.map((row) => ({
            browser: row.dimensionValues?.[0]?.value ?? "Unknown",
            views: parseInt(row.metricValues?.[0]?.value ?? "0", 10),
          })) ?? []
        );
      }
      logger.error?.("Error fetching browser stats", err);
      return [];
    }
  }

  private async getSessionStats(
    projectId: string,
    startDate: string,
    endDate: string
  ): Promise<{
    avgDuration: number;
    bounceRate: number;
    newVsReturning: { newUsers: number; returningUsers: number };
  }> {
    const empty = {
      avgDuration: 0,
      bounceRate: 0,
      newVsReturning: { newUsers: 0, returningUsers: 0 },
    };
    if (!this.client) return empty;
    try {
      const [response] = await this.client.runReport({
        property: `properties/${this.propertyId}`,
        dateRanges: [{ startDate, endDate }],
        metrics: [
          { name: "averageSessionDuration" },
          { name: "bounceRate" },
          { name: "newUsers" },
          { name: "activeUsers" },
        ],
        dimensionFilter: this.projectFilter(projectId),
      });
      const row = response.rows?.[0];
      const avgDuration = parseFloat(row?.metricValues?.[0]?.value ?? "0");
      const bounceRate = parseFloat(row?.metricValues?.[1]?.value ?? "0");
      const newUsers = parseInt(row?.metricValues?.[2]?.value ?? "0", 10);
      const activeUsers = parseInt(row?.metricValues?.[3]?.value ?? "0", 10);
      return {
        avgDuration: Math.round(avgDuration),
        bounceRate: Math.round(bounceRate * 100),
        newVsReturning: { newUsers, returningUsers: Math.max(0, activeUsers - newUsers) },
      };
    } catch (err) {
      if (isInvalidArgument(err)) {
        try {
          const [response] = await this.client.runReport({
            property: `properties/${this.propertyId}`,
            dateRanges: [{ startDate, endDate }],
            metrics: [
              { name: "averageSessionDuration" },
              { name: "bounceRate" },
              { name: "newUsers" },
              { name: "activeUsers" },
            ],
          });
          const row = response.rows?.[0];
          const avgDuration = parseFloat(row?.metricValues?.[0]?.value ?? "0");
          const bounceRate = parseFloat(row?.metricValues?.[1]?.value ?? "0");
          const newUsers = parseInt(row?.metricValues?.[2]?.value ?? "0", 10);
          const activeUsers = parseInt(row?.metricValues?.[3]?.value ?? "0", 10);
          return {
            avgDuration: Math.round(avgDuration),
            bounceRate: Math.round(bounceRate * 100),
            newVsReturning: { newUsers, returningUsers: Math.max(0, activeUsers - newUsers) },
          };
        } catch {
          return empty;
        }
      }
      logger.error?.("Error fetching session stats", err);
      return empty;
    }
  }

  /** Returns session duration and bounce rate per day for the date range. */
  private async getSessionStatsByDay(
    projectId: string,
    startDate: string,
    endDate: string
  ): Promise<DailySessionStats[]> {
    if (!this.client) return [];
    try {
      const [response] = await this.client.runReport({
        property: `properties/${this.propertyId}`,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "date" }],
        metrics: [
          { name: "averageSessionDuration" },
          { name: "bounceRate" },
        ],
        dimensionFilter: this.projectFilter(projectId),
        orderBys: [{ dimension: { dimensionName: "date" } }],
      });
      return (response.rows ?? []).map((row) => {
        const dateRaw = row.dimensionValues?.[0]?.value ?? "";
        const yyyy = dateRaw.slice(0, 4);
        const mm = dateRaw.slice(4, 6);
        const dd = dateRaw.slice(6, 8);
        const date = `${yyyy}-${mm}-${dd}`;
        const avgDuration = parseFloat(row.metricValues?.[0]?.value ?? "0");
        const bounceRate = parseFloat(row.metricValues?.[1]?.value ?? "0");
        return {
          date,
          avgSessionDuration: Math.round(avgDuration),
          bounceRate: Math.round(bounceRate * 100),
        };
      });
    } catch (err) {
      if (isInvalidArgument(err)) {
        try {
          const [response] = await this.client.runReport({
            property: `properties/${this.propertyId}`,
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: "date" }],
            metrics: [
              { name: "averageSessionDuration" },
              { name: "bounceRate" },
            ],
            orderBys: [{ dimension: { dimensionName: "date" } }],
          });
          return (response.rows ?? []).map((row) => {
            const dateRaw = row.dimensionValues?.[0]?.value ?? "";
            const yyyy = dateRaw.slice(0, 4);
            const mm = dateRaw.slice(4, 6);
            const dd = dateRaw.slice(6, 8);
            const date = `${yyyy}-${mm}-${dd}`;
            const avgDuration = parseFloat(row.metricValues?.[0]?.value ?? "0");
            const bounceRate = parseFloat(row.metricValues?.[1]?.value ?? "0");
            return {
              date,
              avgSessionDuration: Math.round(avgDuration),
              bounceRate: Math.round(bounceRate * 100),
            };
          });
        } catch {
          return [];
        }
      }
      logger.error?.("Error fetching session stats by day", err);
      return [];
    }
  }
}

export const ga4Service = new GA4Service();
