import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, S3_CONFIG } from "../config/aws";

const WHITELIST_PREFIX = "whitelist/projects/";
const FILE_SUFFIX = ".txt";

function getWhitelistKey(projectId: string): string {
  return `${WHITELIST_PREFIX}${projectId}${FILE_SUFFIX}`;
}

export interface WhitelistEntry {
  address: string;
  date: string; // ISO date string
}

/** Normalize EVM/Solana address for storage (lowercase for EVM, keep case for Solana if needed). */
function normalizeAddress(address: string): string {
  const trimmed = address.trim();
  if (trimmed.startsWith("0x")) return trimmed.toLowerCase();
  return trimmed;
}

/** Parse S3 file content: one line per "address,isoDate", comma-separated on each line. */
function parseWhitelistContent(body: string): WhitelistEntry[] {
  const lines = body.split(/\r?\n/).filter((line) => line.trim());
  const entries: WhitelistEntry[] = [];
  for (const line of lines) {
    const idx = line.indexOf(",");
    if (idx === -1) continue;
    const address = line.slice(0, idx).trim();
    const date = line.slice(idx + 1).trim();
    if (address && date) entries.push({ address: normalizeAddress(address), date });
  }
  return entries;
}

/** Serialize entries to file content. */
function serializeEntries(entries: WhitelistEntry[]): string {
  return entries.map((e) => `${e.address},${e.date}`).join("\n");
}

export async function getWhitelistEntries(projectId: string): Promise<WhitelistEntry[]> {
  const key = getWhitelistKey(projectId);
  try {
    const command = new GetObjectCommand({
      Bucket: S3_CONFIG.BUCKET_NAME,
      Key: key,
    });
    const response = await s3Client.send(command);
    const body = await response.Body?.transformToString();
    if (!body) return [];
    return parseWhitelistContent(body);
  } catch (err: unknown) {
    const code = (err as { name?: string })?.name;
    if (code === "NoSuchKey") return [];
    throw err;
  }
}

export interface AddWhitelistEntryResult {
  entries: WhitelistEntry[];
  alreadyWhitelisted: boolean;
}

export async function addWhitelistEntry(
  projectId: string,
  address: string
): Promise<AddWhitelistEntryResult> {
  const normalized = normalizeAddress(address);
  if (!normalized) throw new Error("Invalid address");

  const existing = await getWhitelistEntries(projectId);
  if (existing.some((e) => e.address === normalized)) {
    return { entries: existing, alreadyWhitelisted: true };
  }

  const date = new Date().toISOString();
  const newEntry: WhitelistEntry = { address: normalized, date };
  const updated = [...existing, newEntry];
  const key = getWhitelistKey(projectId);
  const command = new PutObjectCommand({
    Bucket: S3_CONFIG.BUCKET_NAME,
    Key: key,
    Body: serializeEntries(updated),
    ContentType: "text/plain",
  });
  await s3Client.send(command);
  return { entries: updated, alreadyWhitelisted: false };
}

export async function removeWhitelistEntry(
  projectId: string,
  address: string
): Promise<WhitelistEntry[]> {
  const normalized = normalizeAddress(address);
  const existing = await getWhitelistEntries(projectId);
  const updated = existing.filter((e) => e.address !== normalized);
  if (updated.length === existing.length) return existing;

  const key = getWhitelistKey(projectId);
  if (updated.length === 0) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await s3Client.send(
      new DeleteObjectCommand({ Bucket: S3_CONFIG.BUCKET_NAME, Key: key })
    );
    return [];
  }

  const command = new PutObjectCommand({
    Bucket: S3_CONFIG.BUCKET_NAME,
    Key: key,
    Body: serializeEntries(updated),
    ContentType: "text/plain",
  });
  await s3Client.send(command);
  return updated;
}
