import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, S3_CONFIG } from "../config/aws";

const WHITELIST_PREFIX = "whitelist/projects/";
const LEGACY_SUFFIX = ".txt";
const JSON_SUFFIX = ".json";

const DEFAULT_LIST_NAME = "Personal Whitelist";

function getLegacyKey(projectId: string): string {
  return `${WHITELIST_PREFIX}${projectId}${LEGACY_SUFFIX}`;
}

function getWhitelistKey(projectId: string): string {
  return `${WHITELIST_PREFIX}${projectId}${JSON_SUFFIX}`;
}

export interface WhitelistEntry {
  address: string;
  date: string; // ISO date string
}

export interface WhitelistList {
  id: string;
  name: string;
  entries: WhitelistEntry[];
}

export interface WhitelistData {
  lists: WhitelistList[];
}

/** Normalize EVM/Solana address for storage (lowercase for EVM, keep case for Solana if needed). */
function normalizeAddress(address: string): string {
  const trimmed = address.trim();
  if (trimmed.startsWith("0x")) return trimmed.toLowerCase();
  return trimmed;
}

/** Parse legacy .txt: one line per "address,isoDate". */
function parseLegacyContent(body: string): WhitelistEntry[] {
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

/** Read legacy .txt file if it exists. */
async function getLegacyEntries(projectId: string): Promise<WhitelistEntry[] | null> {
  const key = getLegacyKey(projectId);
  try {
    const command = new GetObjectCommand({
      Bucket: S3_CONFIG.BUCKET_NAME,
      Key: key,
    });
    const response = await s3Client.send(command);
    const body = await response.Body?.transformToString();
    if (!body) return [];
    return parseLegacyContent(body);
  } catch (err: unknown) {
    const code = (err as { name?: string })?.name;
    if (code === "NoSuchKey") return null;
    throw err;
  }
}

/** Load whitelist data (JSON). Migrates from legacy .txt to default list if needed. */
export async function getWhitelistData(projectId: string): Promise<WhitelistData> {
  const key = getWhitelistKey(projectId);
  try {
    const command = new GetObjectCommand({
      Bucket: S3_CONFIG.BUCKET_NAME,
      Key: key,
    });
    const response = await s3Client.send(command);
    const body = await response.Body?.transformToString();
    if (!body) {
      const legacy = await getLegacyEntries(projectId);
      if (legacy !== null) {
        const data: WhitelistData = {
          lists: [{ id: "default", name: DEFAULT_LIST_NAME, entries: legacy }],
        };
        await saveWhitelistData(projectId, data);
        return data;
      }
      return { lists: [{ id: "default", name: DEFAULT_LIST_NAME, entries: [] }] };
    }
    const data = JSON.parse(body) as WhitelistData;
    if (!data.lists || !Array.isArray(data.lists) || data.lists.length === 0) {
      return { lists: [{ id: "default", name: DEFAULT_LIST_NAME, entries: [] }] };
    }
    return data;
  } catch (err: unknown) {
    const code = (err as { name?: string })?.name;
    if (code === "NoSuchKey") {
      const legacy = await getLegacyEntries(projectId);
      if (legacy !== null) {
        const data: WhitelistData = {
          lists: [{ id: "default", name: DEFAULT_LIST_NAME, entries: legacy }],
        };
        await saveWhitelistData(projectId, data);
        return data;
      }
      return { lists: [{ id: "default", name: DEFAULT_LIST_NAME, entries: [] }] };
    }
    throw err;
  }
}

async function saveWhitelistData(projectId: string, data: WhitelistData): Promise<void> {
  const key = getWhitelistKey(projectId);
  const command = new PutObjectCommand({
    Bucket: S3_CONFIG.BUCKET_NAME,
    Key: key,
    Body: JSON.stringify(data),
    ContentType: "application/json",
  });
  await s3Client.send(command);
}

/** Get entries for a single list (legacy helper – prefers default list). */
export async function getWhitelistEntries(projectId: string, listId?: string): Promise<WhitelistEntry[]> {
  const data = await getWhitelistData(projectId);
  const id = listId ?? "default";
  const list = data.lists.find((l) => l.id === id);
  return list?.entries ?? [];
}

/** Get default list entries (for public submit/check). */
export async function getDefaultListEntries(projectId: string): Promise<WhitelistEntry[]> {
  const data = await getWhitelistData(projectId);
  const defaultList = data.lists.find((l) => l.id === "default") ?? data.lists[0];
  return defaultList?.entries ?? [];
}

export interface AddWhitelistEntryResult {
  entries: WhitelistEntry[];
  alreadyWhitelisted: boolean;
}

export async function addWhitelistEntry(
  projectId: string,
  address: string,
  listId: string = "default"
): Promise<AddWhitelistEntryResult> {
  const normalized = normalizeAddress(address);
  if (!normalized) throw new Error("Invalid address");

  const data = await getWhitelistData(projectId);
  const listIndex = data.lists.findIndex((l) => l.id === listId);
  if (listIndex === -1) throw new Error("Whitelist not found");

  const list = data.lists[listIndex];
  if (list.entries.some((e) => e.address === normalized)) {
    return { entries: list.entries, alreadyWhitelisted: true };
  }

  const date = new Date().toISOString();
  const newEntry: WhitelistEntry = { address: normalized, date };
  const updatedEntries = [...list.entries, newEntry];
  data.lists[listIndex] = { ...list, entries: updatedEntries };
  await saveWhitelistData(projectId, data);
  return { entries: updatedEntries, alreadyWhitelisted: false };
}

export interface AddWhitelistEntriesBulkResult {
  entries: WhitelistEntry[];
  addedCount: number;
  alreadyCount: number;
}

/** Add many addresses to a list in one read/write. Use for 100+ addresses to avoid timeouts. */
export async function addWhitelistEntriesBulk(
  projectId: string,
  listId: string,
  addresses: string[]
): Promise<AddWhitelistEntriesBulkResult> {
  if (!addresses.length) return { entries: [], addedCount: 0, alreadyCount: 0 };

  const data = await getWhitelistData(projectId);
  const listIndex = data.lists.findIndex((l) => l.id === listId);
  if (listIndex === -1) throw new Error("Whitelist not found");

  const list = data.lists[listIndex];
  const existingSet = new Set(list.entries.map((e) => e.address));
  const date = new Date().toISOString();
  let addedCount = 0;
  let alreadyCount = 0;
  const newEntries: WhitelistEntry[] = [...list.entries];

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
    data.lists[listIndex] = { ...list, entries: newEntries };
    await saveWhitelistData(projectId, data);
  }
  return { entries: newEntries, addedCount, alreadyCount };
}

export async function removeWhitelistEntry(
  projectId: string,
  address: string,
  listId: string = "default"
): Promise<WhitelistEntry[]> {
  const normalized = normalizeAddress(address);
  const data = await getWhitelistData(projectId);
  const listIndex = data.lists.findIndex((l) => l.id === listId);
  if (listIndex === -1) throw new Error("Whitelist not found");

  const list = data.lists[listIndex];
  const updated = list.entries.filter((e) => e.address !== normalized);
  if (updated.length === list.entries.length) return list.entries;

  data.lists[listIndex] = { ...list, entries: updated };
  await saveWhitelistData(projectId, data);
  return updated;
}

function generateListId(): string {
  return `list_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function createWhitelistList(projectId: string, name: string): Promise<WhitelistList> {
  const data = await getWhitelistData(projectId);
  const id = generateListId();
  const list: WhitelistList = { id, name: name.trim() || "Unnamed list", entries: [] };
  data.lists.push(list);
  await saveWhitelistData(projectId, data);
  return list;
}

export async function updateWhitelistListName(
  projectId: string,
  listId: string,
  name: string
): Promise<WhitelistList> {
  const data = await getWhitelistData(projectId);
  const listIndex = data.lists.findIndex((l) => l.id === listId);
  if (listIndex === -1) throw new Error("Whitelist not found");
  const list = data.lists[listIndex];
  const newName = name.trim() || list.name;
  data.lists[listIndex] = { ...list, name: newName };
  await saveWhitelistData(projectId, data);
  return data.lists[listIndex];
}

export async function deleteWhitelistList(projectId: string, listId: string): Promise<WhitelistData> {
  const data = await getWhitelistData(projectId);
  const filtered = data.lists.filter((l) => l.id !== listId);
  if (filtered.length === data.lists.length) throw new Error("Whitelist not found");
  if (filtered.length === 0) {
    data.lists = [{ id: "default", name: DEFAULT_LIST_NAME, entries: [] }];
  } else {
    data.lists = filtered;
  }
  await saveWhitelistData(projectId, data);
  return data;
}
