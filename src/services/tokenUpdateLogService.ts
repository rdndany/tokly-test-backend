import type { TokenDetails } from "../types/tokenDetails";

export interface TokenUpdateLogEntry {
  id: string;
  timestamp: string;
  source: "cron" | "manual";
  projectId: string;
  projectName: string;
  contractAddress: string;
  tokenDetails: TokenDetails | null;
  success: boolean;
  error?: string;
}

const MAX_LOGS = 500;
const logs: TokenUpdateLogEntry[] = [];

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `log-${Date.now()}-${idCounter}`;
}

/**
 * Append a token update log entry (in-memory, last MAX_LOGS kept).
 */
export function addTokenUpdateLog(
  entry: Omit<TokenUpdateLogEntry, "id" | "timestamp">
): void {
  const full: TokenUpdateLogEntry = {
    ...entry,
    id: nextId(),
    timestamp: new Date().toISOString(),
  };
  logs.unshift(full);
  if (logs.length > MAX_LOGS) {
    logs.length = MAX_LOGS;
  }
}

/**
 * Get recent token update logs (newest first).
 */
export function getTokenUpdateLogs(limit: number = 100): TokenUpdateLogEntry[] {
  return logs.slice(0, Math.min(limit, logs.length));
}

/**
 * Clear all token update logs (in-memory store).
 */
export function clearTokenUpdateLogs(): void {
  logs.length = 0;
}
