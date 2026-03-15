import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, S3_CONFIG } from "../config/aws";

const AIRDROP_PREFIX = "airdrop/projects/";
const JSON_SUFFIX = ".json";
const DISTRIBUTION_SUFFIX = "-distribution.json";

function getAirdropKey(projectId: string): string {
  return `${AIRDROP_PREFIX}${projectId}${JSON_SUFFIX}`;
}

function getDistributionKey(projectId: string): string {
  return `${AIRDROP_PREFIX}${projectId}${DISTRIBUTION_SUFFIX}`;
}

/** Solana airdrop distribution (batches, status, etc.) – stored in S3 to avoid MongoDB size limits. */
export interface AirdropDistributionData {
  initiatedAt: string;
  network: string;
  status: "in_progress" | "in_progress_send_all" | "completed";
  batches: Array<{
    batchIndex: number;
    recipients: number;
    amountTokens: string;
    status: string;
    tx?: string;
  }>;
  amountPerRecipient: string;
  totalRecipients: number;
}

/** Save distribution to S3 (used when user sends batches manually or Send all). */
export async function saveDistributionToS3(
  projectId: string,
  distribution: AirdropDistributionData
): Promise<void> {
  const key = getDistributionKey(projectId);
  const command = new PutObjectCommand({
    Bucket: S3_CONFIG.BUCKET_NAME,
    Key: key,
    Body: JSON.stringify(distribution),
    ContentType: "application/json",
  });
  await s3Client.send(command);
}

/** Load distribution from S3. Returns null if not found. */
export async function getDistributionFromS3(
  projectId: string
): Promise<AirdropDistributionData | null> {
  const key = getDistributionKey(projectId);
  try {
    const command = new GetObjectCommand({
      Bucket: S3_CONFIG.BUCKET_NAME,
      Key: key,
    });
    const response = await s3Client.send(command);
    const body = await response.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body) as AirdropDistributionData;
  } catch (err: unknown) {
    const code = (err as { name?: string })?.name;
    if (code === "NoSuchKey") return null;
    throw err;
  }
}

/** Delete distribution from S3 (when user cancels distribution). */
export async function deleteDistributionFromS3(projectId: string): Promise<void> {
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const key = getDistributionKey(projectId);
  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: S3_CONFIG.BUCKET_NAME,
        Key: key,
      })
    );
  } catch {
    // Ignore if key does not exist
  }
}

export interface AirdropEntry {
  address: string;
  date: string; // ISO date string
}

export interface AirdropData {
  entries: AirdropEntry[];
}

/** Normalize EVM address for storage (lowercase). */
function normalizeAddress(address: string): string {
  const trimmed = address.trim();
  if (trimmed.startsWith("0x")) return trimmed.toLowerCase();
  return trimmed;
}

/** Load airdrop data (JSON). */
export async function getAirdropData(projectId: string): Promise<AirdropData> {
  const key = getAirdropKey(projectId);
  try {
    const command = new GetObjectCommand({
      Bucket: S3_CONFIG.BUCKET_NAME,
      Key: key,
    });
    const response = await s3Client.send(command);
    const body = await response.Body?.transformToString();
    if (!body) return { entries: [] };
    const data = JSON.parse(body) as AirdropData;
    if (!data.entries || !Array.isArray(data.entries)) return { entries: [] };
    return data;
  } catch (err: unknown) {
    const code = (err as { name?: string })?.name;
    if (code === "NoSuchKey") return { entries: [] };
    throw err;
  }
}

async function saveAirdropData(projectId: string, data: AirdropData): Promise<void> {
  const key = getAirdropKey(projectId);
  const command = new PutObjectCommand({
    Bucket: S3_CONFIG.BUCKET_NAME,
    Key: key,
    Body: JSON.stringify(data),
    ContentType: "application/json",
  });
  await s3Client.send(command);
}

export interface AddAirdropEntryResult {
  entries: AirdropEntry[];
  alreadyAdded: boolean;
}

export async function addAirdropEntry(projectId: string, address: string): Promise<AddAirdropEntryResult> {
  const normalized = normalizeAddress(address);
  if (!normalized) throw new Error("Invalid address");

  const data = await getAirdropData(projectId);
  if (data.entries.some((e) => e.address === normalized)) {
    return { entries: data.entries, alreadyAdded: true };
  }

  const date = new Date().toISOString();
  const newEntry: AirdropEntry = { address: normalized, date };
  const updatedEntries = [...data.entries, newEntry];
  await saveAirdropData(projectId, { entries: updatedEntries });
  return { entries: updatedEntries, alreadyAdded: false };
}

export interface AddAirdropEntriesBulkResult {
  entries: AirdropEntry[];
  addedCount: number;
  alreadyCount: number;
}

/** Add many addresses in one read/write. Use for 100+ addresses to avoid timeouts. */
export async function addAirdropEntriesBulk(
  projectId: string,
  addresses: string[]
): Promise<AddAirdropEntriesBulkResult> {
  if (!addresses.length) return { entries: [], addedCount: 0, alreadyCount: 0 };

  const data = await getAirdropData(projectId);
  const existingSet = new Set(data.entries.map((e) => e.address));
  const date = new Date().toISOString();
  let addedCount = 0;
  let alreadyCount = 0;
  const newEntries: AirdropEntry[] = [...data.entries];

  for (const raw of addresses) {
    const normalized = normalizeAddress(raw);
    if (!normalized) continue;
    if (existingSet.has(normalized)) {
      alreadyCount += 1;
      continue;
    }
    existingSet.add(normalized);
    newEntries.push({ address: normalized, date });
    addedCount += 1;
  }

  if (addedCount > 0) {
    await saveAirdropData(projectId, { entries: newEntries });
  }
  return { entries: newEntries, addedCount, alreadyCount };
}

export async function removeAirdropEntry(projectId: string, address: string): Promise<AirdropEntry[]> {
  const normalized = normalizeAddress(address);
  const data = await getAirdropData(projectId);
  const updated = data.entries.filter((e) => e.address !== normalized);
  if (updated.length === data.entries.length) return data.entries;
  await saveAirdropData(projectId, { entries: updated });
  return updated;
}

export async function getAirdropEntries(projectId: string): Promise<AirdropEntry[]> {
  const data = await getAirdropData(projectId);
  return data.entries;
}

/** Remove all airdrop entries for a project. */
export async function clearAirdropEntries(projectId: string): Promise<void> {
  await saveAirdropData(projectId, { entries: [] });
}
