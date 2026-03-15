/**
 * Check airdrop participation requirements (min transactions, etc.) before allowing registration.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { getTokenMetadata } from "@solana/spl-token";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { getRpcUrl } from "./solanaRelayService";

export type ParticipationRequirement =
  | { type: "min_transactions"; count?: number }
  | { type: "min_native_balance"; amount?: string }
  | { type: "min_gas_spent"; gasValue?: string }
  | { type: "activity_days"; days?: number }
  | { type: "min_token_balance"; tokenAmount?: string; tokenContract?: string; tokenName?: string; tokenSymbol?: string }
  | { type: string; count?: number; amount?: string; gasValue?: string; days?: number; tokenAmount?: string; tokenContract?: string; [key: string]: unknown };

/** Get the minimum transactions requirement if present. */
export function getMinTransactionsRequirement(
  participationRequirements: ParticipationRequirement[] | undefined
): number | null {
  if (!Array.isArray(participationRequirements)) return null;
  const req = participationRequirements.find(
    (r) => r && (r as { type?: string }).type === "min_transactions"
  ) as { count?: number } | undefined;
  if (!req || req.count == null) return null;
  const n = Number(req.count);
  return n > 0 ? n : null;
}

/** Get the minimum native balance requirement if present. Returns required amount as string (e.g. "1.5"). */
export function getMinNativeBalanceRequirement(
  participationRequirements: ParticipationRequirement[] | undefined
): string | null {
  if (!Array.isArray(participationRequirements)) return null;
  const req = participationRequirements.find(
    (r) => r && (r as { type?: string }).type === "min_native_balance"
  ) as { amount?: string } | undefined;
  if (!req || req.amount == null || String(req.amount).trim() === "") return null;
  const amount = String(req.amount).trim();
  const num = parseFloat(amount);
  return Number.isFinite(num) && num > 0 ? amount : null;
}

/** Get the minimum gas spent requirement if present. Returns required amount as string in native token (e.g. "0.01"). */
export function getMinGasSpentRequirement(
  participationRequirements: ParticipationRequirement[] | undefined
): string | null {
  if (!Array.isArray(participationRequirements)) return null;
  const req = participationRequirements.find(
    (r) => r && (r as { type?: string }).type === "min_gas_spent"
  ) as { gasValue?: string } | undefined;
  if (!req || req.gasValue == null || String(req.gasValue).trim() === "") return null;
  const amount = String(req.gasValue).trim();
  const num = parseFloat(amount);
  return Number.isFinite(num) && num >= 0 ? amount : null;
}

/** Get the activity-over-days requirement if present. Returns required number of distinct days (e.g. 30). */
export function getActivityDaysRequirement(
  participationRequirements: ParticipationRequirement[] | undefined
): number | null {
  if (!Array.isArray(participationRequirements)) return null;
  const req = participationRequirements.find(
    (r) => r && (r as { type?: string }).type === "activity_days"
  ) as { days?: number } | undefined;
  if (!req || req.days == null) return null;
  const n = Number(req.days);
  return n > 0 ? n : null;
}

/** Get the min-token-balance requirement if present. Returns { amount, tokenContract } or null. */
export function getMinTokenBalanceRequirement(
  participationRequirements: ParticipationRequirement[] | undefined
): { amount: string; tokenContract: string } | null {
  if (!Array.isArray(participationRequirements)) return null;
  const req = participationRequirements.find(
    (r) => r && (r as { type?: string }).type === "min_token_balance"
  ) as { tokenAmount?: string; tokenContract?: string } | undefined;
  if (!req || !req.tokenAmount?.trim() || !req.tokenContract?.trim()) return null;
  const amount = String(req.tokenAmount).trim();
  const num = parseFloat(amount);
  if (!Number.isFinite(num) || num < 0) return null;
  return { amount, tokenContract: String(req.tokenContract).trim() };
}

/** Chain id / name to public JSON-RPC URL for eth_getTransactionCount. */
const EVM_RPC_URL: Record<string, string> = {
  "1": "https://eth.llamarpc.com",
  eth: "https://eth.llamarpc.com",
  ethereum: "https://eth.llamarpc.com",
  "56": "https://bsc-dataseed.binance.org",
  bsc: "https://bsc-dataseed.binance.org",
  "97": "https://data-seed-prebsc-1-s1.binance.org:8545",
  "8453": "https://mainnet.base.org",
  base: "https://mainnet.base.org",
  "42161": "https://arb1.arbitrum.io/rpc",
  arbitrum: "https://arb1.arbitrum.io/rpc",
};

function getEvmRpcUrl(chain: string): string | null {
  const key = chain.toLowerCase().trim();
  return EVM_RPC_URL[key] ?? null;
}

/** Etherscan API v2 is multichain: same base URL + chainid. V1 txlist is deprecated. */
const EVM_EXPLORER_V2_BASE = "https://api.etherscan.io/v2/api";

/** Map chain name/id to Etherscan V2 chainid (same as network chain id). */
const EVM_CHAIN_ID: Record<string, number> = {
  "1": 1,
  eth: 1,
  ethereum: 1,
  "56": 56,
  bsc: 56,
  "97": 97,
  "bsc testnet": 97,
  "bnb testnet": 97,
  "8453": 8453,
  base: 8453,
  "42161": 42161,
  arbitrum: 42161,
};

function getEvmChainIdForExplorer(chain: string): number | null {
  const key = chain.toLowerCase().trim();
  return EVM_CHAIN_ID[key] ?? null;
}

/** Chain IDs that are testnets; Etherscan V2 often restricts txlist to paid tier for these, so we use tx-count fallback. */
const EVM_TESTNET_CHAIN_IDS = new Set([97, 11155111, 84532, 80002, 10143]);

/** Get EVM transaction count (nonce = number of txs sent from address) via JSON-RPC. */
export async function getEvmTransactionCount(
  address: string,
  chain: string,
  _apiKey?: string
): Promise<number> {
  const rpcUrl = getEvmRpcUrl(chain);
  if (!rpcUrl) {
    throw new Error(`Unsupported EVM chain for transaction count: ${chain}`);
  }
  const normalized = address.startsWith("0x") ? address.toLowerCase() : `0x${address.toLowerCase()}`;
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_getTransactionCount",
    params: [normalized, "latest"],
  });
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json()) as { result?: string; error?: { message?: string } };
  if (data.error) {
    throw new Error(data.error.message ?? "RPC error");
  }
  const hex = typeof data.result === "string" ? data.result : "";
  if (!hex || !/^0x[0-9a-fA-F]*$/.test(hex)) return 0;
  return parseInt(hex, 16) || 0;
}

/** Get EVM native balance (wei) via JSON-RPC eth_getBalance. */
export async function getEvmNativeBalance(address: string, chain: string): Promise<bigint> {
  const rpcUrl = getEvmRpcUrl(chain);
  if (!rpcUrl) throw new Error(`Unsupported EVM chain for balance: ${chain}`);
  const normalized = address.startsWith("0x") ? address.toLowerCase() : `0x${address.toLowerCase()}`;
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_getBalance",
    params: [normalized, "latest"],
  });
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json()) as { result?: string; error?: { message?: string } };
  if (data.error) throw new Error(data.error.message ?? "RPC error");
  const hex = typeof data.result === "string" ? data.result : "0x0";
  if (!/^0x[0-9a-fA-F]*$/.test(hex)) return BigInt(0);
  return BigInt(hex);
}

/** Parse human-readable amount to wei (18 decimals). */
function parseAmountToWei(amountStr: string): bigint {
  const num = parseFloat(amountStr);
  if (!Number.isFinite(num) || num < 0) return BigInt(0);
  const [whole = "0", frac = ""] = amountStr.trim().split(".");
  const decimals = frac.slice(0, 18).padEnd(18, "0");
  return BigInt(whole) * BigInt(10 ** 18) + BigInt(decimals);
}

/** Check if an EVM address has at least minAmount (human string, e.g. "1.5") native balance. */
export async function checkEvmMinNativeBalance(
  address: string,
  chain: string,
  minAmountHuman: string
): Promise<{ ok: boolean; message?: string }> {
  const minWei = parseAmountToWei(minAmountHuman);
  const balanceWei = await getEvmNativeBalance(address, chain);
  const ok = balanceWei >= minWei;
  return {
    ok,
    message: ok ? undefined : `Insufficient native balance. Minimum ${minAmountHuman} required for this chain.`,
  };
}

/** Get total gas spent by an EVM address (sum of gasUsed * gasPrice in wei) via Etherscan API v2 txlist. */
export async function getEvmTotalGasSpentWei(
  address: string,
  chain: string,
  apiKey?: string
): Promise<bigint> {
  const chainId = getEvmChainIdForExplorer(chain);
  if (chainId == null) throw new Error(`Unsupported EVM chain for gas spent: ${chain}`);
  const normalized = address.startsWith("0x") ? address.toLowerCase() : `0x${address.toLowerCase()}`;
  const params = new URLSearchParams({
    chainid: String(chainId),
    module: "account",
    action: "txlist",
    address: normalized,
    startblock: "0",
    endblock: "99999999",
    page: "1",
    offset: "10000",
    sort: "asc",
  });
  if (apiKey) params.set("apikey", apiKey);
  const url = `${EVM_EXPLORER_V2_BASE}?${params.toString()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const data = (await res.json()) as {
    status?: string;
    message?: string;
    result?: Array<{ gasUsed?: string; gas?: string; gasPrice?: string }>;
  };
  if (data.status !== "1" || !Array.isArray(data.result)) return BigInt(0);
  let totalWei = BigInt(0);
  for (const tx of data.result) {
    const gasUsedHex = tx.gasUsed ?? tx.gas ?? "0x0";
    const gasPriceHex = tx.gasPrice ?? "0x0";
    const gasUsed = BigInt(gasUsedHex);
    const gasPrice = BigInt(gasPriceHex);
    totalWei += gasUsed * gasPrice;
  }
  return totalWei;
}

/** Tx record from Etherscan txlist; timeStamp can be string or number (unix seconds). */
type TxListRecord = Record<string, unknown> & { timeStamp?: string | number; timestamp?: string | number };


/** Fetch EVM txlist from Etherscan V2; returns array of tx records. Handles result as string (error). */
async function getEvmTxList(
  address: string,
  chain: string,
  apiKey?: string
): Promise<TxListRecord[]> {
  const chainId = getEvmChainIdForExplorer(chain);
  if (chainId == null) return [];
  const normalized = address.startsWith("0x") ? address.toLowerCase() : `0x${address.toLowerCase()}`;
  const params = new URLSearchParams({
    chainid: String(chainId),
    module: "account",
    action: "txlist",
    address: normalized,
    startblock: "0",
    endblock: "99999999",
    page: "1",
    offset: "10000",
    sort: "asc",
  });
  if (apiKey) params.set("apikey", apiKey);
  const url = `${EVM_EXPLORER_V2_BASE}?${params.toString()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const data = (await res.json()) as {
    status?: string;
    result?: TxListRecord[] | string;
  };
  if (data.status !== "1" || !Array.isArray(data.result)) return [];
  return data.result;
}

/** Parse unix timestamp (seconds) from a tx record; supports timeStamp/timestamp, string or number, decimal or hex. */
function parseTxTimestamp(tx: TxListRecord): number | null {
  const raw = tx.timeStamp ?? tx.timestamp;
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.floor(raw);
  const s = String(raw).trim();
  if (!s) return null;
  if (s.startsWith("0x")) {
    const n = parseInt(s, 16);
    return Number.isFinite(n) ? n : null;
  }
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/** Get wallet age in days: days since first (oldest) outgoing tx. One API call (txlist sort=asc, page 1; first tx = oldest). Returns 0 if no txs or API fails. */
export async function getEvmWalletAgeDays(
  address: string,
  chain: string,
  apiKey?: string
): Promise<number> {
  const txs = await getEvmTxList(address, chain, apiKey);
  if (txs.length === 0) return 0;
  const firstTs = parseTxTimestamp(txs[0]);
  if (firstTs == null) return 0;
  const nowSec = Math.floor(Date.now() / 1000);
  const ageDays = Math.floor((nowSec - firstTs) / 86400);
  return Math.max(0, ageDays);
}

/** Count distinct calendar days (UTC) with outgoing tx activity for an EVM address. Uses wallet age for EVM (days since first tx). */
export async function getEvmActivityDaysCount(
  address: string,
  chain: string,
  apiKey?: string
): Promise<number> {
  return getEvmWalletAgeDays(address, chain, apiKey);
}

/** 0.001 in wei (18 decimals); used as threshold for testnet fallback. */
const ONE_THOUSANDTH_ETH_WEI = BigInt(1e15);

/** Check if an EVM address has spent at least minAmountHuman (e.g. "0.01") in native token on gas. */
export async function checkEvmMinGasSpent(
  address: string,
  chain: string,
  minAmountHuman: string,
  apiKey?: string
): Promise<{ ok: boolean; message?: string }> {
  const minWei = parseAmountToWei(minAmountHuman);
  let totalSpentWei = await getEvmTotalGasSpentWei(address, chain, apiKey);
  let ok = totalSpentWei >= minWei;

  // Testnets (e.g. BSC 97) often have txlist restricted on Etherscan V2 free tier, so we get 0. Use tx count as proxy.
  if (!ok && totalSpentWei === BigInt(0)) {
    const chainId = getEvmChainIdForExplorer(chain);
    if (chainId != null && EVM_TESTNET_CHAIN_IDS.has(chainId) && minWei <= ONE_THOUSANDTH_ETH_WEI) {
      const count = await getEvmTransactionCount(address, chain, apiKey);
      if (count >= 1) ok = true;
    }
  }

  return {
    ok,
    message: ok ? undefined : `Minimum gas spent not met. Required at least ${minAmountHuman} in total gas fees on this chain.`,
  };
}

/** Check if an EVM address is at least minDays old (first tx was minDays+ ago). Uses wallet age. */
export async function checkEvmActivityDays(
  address: string,
  chain: string,
  minDays: number,
  apiKey?: string
): Promise<{ ok: boolean; days: number; message?: string }> {
  const days = await getEvmWalletAgeDays(address, chain, apiKey);
  console.log("[checkEvmActivityDays] wallet age (days):", days, "minDays:", minDays, "address:", address, "chain:", chain);
  const ok = days >= minDays;
  return {
    ok,
    days,
    message: ok ? undefined : `Wallet must be at least ${minDays} day(s) old. Current wallet age: ${days} day(s).`,
  };
}

/** Check if an EVM address has at least minCount transactions (outgoing). */
export async function checkEvmMinTransactions(
  address: string,
  chain: string,
  minCount: number,
  apiKey?: string
): Promise<{ ok: boolean; count: number; message?: string }> {
  const count = await getEvmTransactionCount(address, chain, apiKey);
  return {
    ok: count >= minCount,
    count,
    message: count >= minCount ? undefined : `Wallet has ${count} transaction(s); minimum required is ${minCount}.`,
  };
}

/** Parse human-readable SOL amount to lamports (9 decimals). */
function parseAmountToLamports(amountStr: string): bigint {
  const num = parseFloat(amountStr);
  if (!Number.isFinite(num) || num < 0) return BigInt(0);
  const [whole = "0", frac = ""] = amountStr.trim().split(".");
  const decimals = frac.slice(0, 9).padEnd(9, "0");
  return BigInt(whole) * BigInt(10 ** 9) + BigInt(decimals);
}

/** Get Solana native balance (lamports). */
export async function getSolanaNativeBalance(
  address: string,
  cluster: "devnet" | "mainnet-beta"
): Promise<bigint> {
  let publicKey: PublicKey;
  try {
    publicKey = new PublicKey(address);
  } catch {
    throw new Error("Invalid Solana address");
  }
  const rpcUrl = getRpcUrl(cluster);
  const connection = new Connection(rpcUrl, "confirmed");
  const lamports = await connection.getBalance(publicKey);
  return BigInt(lamports);
}

/** Check if a Solana address has at least minAmount (human string, e.g. "1") SOL. */
export async function checkSolanaMinNativeBalance(
  address: string,
  cluster: "devnet" | "mainnet-beta",
  minAmountHuman: string
): Promise<{ ok: boolean; message?: string }> {
  const minLamports = parseAmountToLamports(minAmountHuman);
  const balanceLamports = await getSolanaNativeBalance(address, cluster);
  const ok = balanceLamports >= minLamports;
  return {
    ok,
    message: ok ? undefined : `Insufficient SOL balance. Minimum ${minAmountHuman} SOL required.`,
  };
}

/** Solana typical fee per transaction in lamports (0.000005 SOL). */
const SOLANA_FEE_PER_TX_LAMPORTS = 5000;

/** Check if a Solana address has spent at least minAmountHuman SOL in fees (estimated from tx count × 5000 lamports/tx). */
export async function checkSolanaMinGasSpent(
  address: string,
  cluster: "devnet" | "mainnet-beta",
  minAmountHuman: string
): Promise<{ ok: boolean; message?: string }> {
  let publicKey: PublicKey;
  try {
    publicKey = new PublicKey(address);
  } catch {
    return { ok: false, message: "Invalid Solana address." };
  }
  const minLamports = parseAmountToLamports(minAmountHuman);
  const rpcUrl = getRpcUrl(cluster);
  const connection = new Connection(rpcUrl, "confirmed");
  const limit = 1000;
  const signatures = await connection.getSignaturesForAddress(publicKey, { limit });
  const estimatedFeeLamports = BigInt(signatures.length) * BigInt(SOLANA_FEE_PER_TX_LAMPORTS);
  const ok = estimatedFeeLamports >= minLamports;
  return {
    ok,
    message: ok ? undefined : `Minimum gas (fee) spent not met. Required at least ${minAmountHuman} SOL in total fees.`,
  };
}

/** Check if a Solana address has at least minCount signatures (transactions). */
export async function checkSolanaMinTransactions(
  address: string,
  cluster: "devnet" | "mainnet-beta",
  minCount: number
): Promise<{ ok: boolean; count: number; message?: string }> {
  let publicKey: PublicKey;
  try {
    publicKey = new PublicKey(address);
  } catch {
    return { ok: false, count: 0, message: "Invalid Solana address." };
  }
  const rpcUrl = getRpcUrl(cluster);
  const connection = new Connection(rpcUrl, "confirmed");
  const limit = Math.min(minCount, 1000);
  const signatures = await connection.getSignaturesForAddress(publicKey, { limit });
  const count = signatures.length;
  const ok = count >= minCount;
  return {
    ok,
    count,
    message: ok ? undefined : `Wallet has ${count} transaction(s); minimum required is ${minCount}.`,
  };
}

/** Max pages to fetch when finding oldest Solana tx (wallet age). */
const SOLANA_WALLET_AGE_MAX_PAGES = 20;

/** Get Solana wallet age in days: days since first (oldest) transaction. Paginates with `before` until we get the oldest tx. */
export async function getSolanaWalletAgeDays(
  address: string,
  cluster: "devnet" | "mainnet-beta"
): Promise<number> {
  let publicKey: PublicKey;
  try {
    publicKey = new PublicKey(address);
  } catch {
    return 0;
  }
  const rpcUrl = getRpcUrl(cluster);
  const connection = new Connection(rpcUrl, "confirmed");
  let before: string | undefined;
  let oldestBlockTime: number | null = null;
  for (let page = 0; page < SOLANA_WALLET_AGE_MAX_PAGES; page++) {
    const options: { limit: number; before?: string } = { limit: 1000 };
    if (before) options.before = before;
    const signatures = await connection.getSignaturesForAddress(publicKey, options);
    if (signatures.length === 0) break;
    const last = signatures[signatures.length - 1];
    const blockTime = last.blockTime;
    if (blockTime != null && Number.isFinite(blockTime)) oldestBlockTime = blockTime;
    if (signatures.length < 1000) break;
    before = last.signature;
  }
  if (oldestBlockTime == null) return 0;
  const nowSec = Math.floor(Date.now() / 1000);
  const ageDays = Math.floor((nowSec - oldestBlockTime) / 86400);
  return Math.max(0, ageDays);
}

/** Check if a Solana address is at least minDays old (first tx was minDays+ ago). Uses wallet age, same semantics as EVM. */
export async function checkSolanaActivityDays(
  address: string,
  cluster: "devnet" | "mainnet-beta",
  minDays: number
): Promise<{ ok: boolean; days: number; message?: string }> {
  const days = await getSolanaWalletAgeDays(address, cluster);
  const ok = days >= minDays;
  return {
    ok,
    days,
    message: ok ? undefined : `Wallet must be at least ${minDays} day(s) old. Current wallet age: ${days} day(s).`,
  };
}

/** EVM: Get ERC20 balance (raw) and decimals via eth_call. */
async function getEvmTokenBalanceRaw(
  address: string,
  tokenContract: string,
  chain: string
): Promise<{ balance: bigint; decimals: number } | null> {
  const rpcUrl = getEvmRpcUrl(chain);
  if (!rpcUrl) return null;
  const normalized = address.startsWith("0x") ? address.toLowerCase() : `0x${address.toLowerCase()}`;
  const token = tokenContract.startsWith("0x") ? tokenContract.toLowerCase() : `0x${tokenContract.toLowerCase()}`;
  const addrPad = normalized.slice(2).padStart(64, "0");
  const balanceOfData = "0x70a08231" + addrPad;
  const decimalsData = "0x313ce567";

  const bodyBalance = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to: token, data: balanceOfData }, "latest"],
  });
  const resBalance = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: bodyBalance,
    signal: AbortSignal.timeout(15_000),
  });
  const dataBalance = (await resBalance.json()) as { result?: string };
  const hexBalance = typeof dataBalance.result === "string" ? dataBalance.result : "0x0";
  if (!/^0x[0-9a-fA-F]*$/.test(hexBalance)) return null;
  const balance = BigInt(hexBalance);

  const bodyDecimals = JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "eth_call",
    params: [{ to: token, data: decimalsData }, "latest"],
  });
  const resDecimals = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: bodyDecimals,
    signal: AbortSignal.timeout(15_000),
  });
  const dataDecimals = (await resDecimals.json()) as { result?: string };
  const hexDecimals = typeof dataDecimals.result === "string" ? dataDecimals.result : "0x12";
  const decimals = parseInt(hexDecimals, 16) || 18;
  return { balance, decimals };
}

/** Check if an EVM address holds at least minAmountHuman of the token at tokenContract. */
export async function checkEvmMinTokenBalance(
  address: string,
  chain: string,
  minAmountHuman: string,
  tokenContract: string
): Promise<{ ok: boolean; message?: string }> {
  const raw = await getEvmTokenBalanceRaw(address, tokenContract, chain);
  if (!raw) {
    return { ok: false, message: "Unable to check token balance for this chain." };
  }
  const { balance, decimals } = raw;
  const minNum = parseFloat(minAmountHuman);
  if (!Number.isFinite(minNum) || minNum < 0) {
    return { ok: false, message: "Invalid minimum token amount." };
  }
  const [whole = "0", frac = ""] = minAmountHuman.trim().split(".");
  const fracPadded = frac.slice(0, decimals).padEnd(decimals, "0");
  const minRaw = BigInt(whole) * BigInt(10 ** decimals) + BigInt(fracPadded || "0");
  const ok = balance >= minRaw;
  return {
    ok,
    message: ok ? undefined : `Minimum token balance not met. Required at least ${minAmountHuman} tokens.`,
  };
}

/** Decode ABI-encoded string from eth_call return (dynamic bytes). */
function decodeEvmString(hex: string): string {
  if (!hex || !hex.startsWith("0x")) return "";
  const raw = hex.slice(2);
  if (raw.length < 128) return "";
  const lenHex = raw.slice(64, 128);
  const len = parseInt(lenHex, 16);
  if (!Number.isFinite(len) || len < 0 || len > 4096) return "";
  const dataHex = raw.slice(128, 128 + len * 2);
  const bytes: number[] = [];
  for (let i = 0; i < dataHex.length; i += 2) {
    bytes.push(parseInt(dataHex.slice(i, i + 2), 16));
  }
  return String.fromCharCode(...bytes).replace(/\0/g, "").trim();
}

/** Get ERC20 name and symbol via eth_call. */
export async function getEvmTokenInfo(
  tokenContract: string,
  chain: string
): Promise<{ name: string; symbol: string } | null> {
  const rpcUrl = getEvmRpcUrl(chain);
  if (!rpcUrl) return null;
  const token = tokenContract.startsWith("0x") ? tokenContract.toLowerCase() : `0x${tokenContract.toLowerCase()}`;
  const nameData = "0x06fdde03";
  const symbolData = "0x95d89b41";

  const resName = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: token, data: nameData }, "latest"],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const dataName = (await resName.json()) as { result?: string };
  const name = decodeEvmString(dataName.result ?? "0x") || "Unknown";

  const resSymbol = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "eth_call",
      params: [{ to: token, data: symbolData }, "latest"],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const dataSymbol = (await resSymbol.json()) as { result?: string };
  const symbol = decodeEvmString(dataSymbol.result ?? "0x") || "???";

  return { name, symbol };
}

/** Metaplex Token Metadata program ID. */
const MPL_TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

/** Get SPL token name/symbol from Metaplex Metadata PDA (legacy). Returns null if no account or parse fails. */
async function getSolanaTokenInfoMetaplex(
  connection: Connection,
  mintPk: PublicKey
): Promise<{ name: string; symbol: string } | null> {
  try {
    const [metadataPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), MPL_TOKEN_METADATA_PROGRAM_ID.toBuffer(), mintPk.toBuffer()],
      MPL_TOKEN_METADATA_PROGRAM_ID
    );
    const acc = await connection.getAccountInfo(metadataPda);
    if (!acc?.data || acc.data.length < 100) return null;
    const data = Buffer.from(acc.data);
    const nameOffset = 1 + 32 + 32;
    const nameLen = data.readUInt32LE(nameOffset);
    const name = data.slice(nameOffset + 4, nameOffset + 4 + nameLen).toString("utf8").replace(/\0/g, "").trim() || "Unknown";
    const symbolLenOffset = nameOffset + 4 + nameLen;
    const symbolLen = data.readUInt32LE(symbolLenOffset);
    const symbolDataStart = symbolLenOffset + 4;
    const symbol = data.slice(symbolDataStart, symbolDataStart + symbolLen).toString("utf8").replace(/\0/g, "").trim() || "???";
    return { name, symbol };
  } catch {
    return null;
  }
}

/** Try to get name/symbol from one cluster (Metaplex then Token-2022). */
async function getSolanaTokenInfoForCluster(
  connection: Connection,
  mintPk: PublicKey
): Promise<{ name: string; symbol: string } | null> {
  const metaplex = await getSolanaTokenInfoMetaplex(connection, mintPk);
  if (metaplex) return metaplex;
  try {
    const token2022Meta = await getTokenMetadata(connection, mintPk, "confirmed", TOKEN_2022_PROGRAM_ID);
    if (token2022Meta?.name != null && token2022Meta?.symbol != null) {
      return {
        name: String(token2022Meta.name).trim() || "Unknown",
        symbol: String(token2022Meta.symbol).trim() || "???",
      };
    }
  } catch {
    // Mint not found on this cluster or not Token-2022 with metadata
  }
  return null;
}

/** Get SPL token name/symbol: tries Metaplex Metadata first, then Token-2022 tokenMetadata extension. Tries requested cluster then the other if not found. */
export async function getSolanaTokenInfo(
  mintAddress: string,
  cluster: "devnet" | "mainnet-beta"
): Promise<{ name: string; symbol: string } | null> {
  try {
    const mintPk = new PublicKey(mintAddress);
    const rpcUrl = getRpcUrl(cluster);
    const connection = new Connection(rpcUrl, "confirmed");

    let info = await getSolanaTokenInfoForCluster(connection, mintPk);
    if (info) return info;

    const otherCluster: "devnet" | "mainnet-beta" = cluster === "devnet" ? "mainnet-beta" : "devnet";
    const otherRpc = getRpcUrl(otherCluster);
    const otherConnection = new Connection(otherRpc, "confirmed");
    info = await getSolanaTokenInfoForCluster(otherConnection, mintPk);
    return info ?? null;
  } catch {
    return null;
  }
}

/** Check if a Solana address holds at least minAmountHuman of the SPL token (mint). */
export async function checkSolanaMinTokenBalance(
  address: string,
  cluster: "devnet" | "mainnet-beta",
  minAmountHuman: string,
  tokenContract: string
): Promise<{ ok: boolean; message?: string }> {
  let ownerPk: PublicKey;
  let mintPk: PublicKey;
  try {
    ownerPk = new PublicKey(address);
    mintPk = new PublicKey(tokenContract);
  } catch {
    return { ok: false, message: "Invalid address or token contract." };
  }
  const rpcUrl = getRpcUrl(cluster);
  const connection = new Connection(rpcUrl, "confirmed");
  const resp = await connection.getParsedTokenAccountsByOwner(ownerPk, { mint: mintPk });
  const items = Array.isArray(resp) ? resp : (resp as { value?: unknown[] }).value ?? [];
  let balanceRaw = BigInt(0);
  let decimals = 9;
  for (const item of items) {
    const account = (item as { account?: { data?: { parsed?: { info?: { tokenAmount?: { amount?: string; decimals?: number } } } } } }).account;
    const parsed = account?.data?.parsed;
    const info = parsed?.info;
    const tokenAmount = info?.tokenAmount;
    const amt = tokenAmount?.amount;
    if (amt != null) balanceRaw += BigInt(amt);
    if (tokenAmount?.decimals != null) decimals = tokenAmount.decimals;
  }
  const minNum = parseFloat(minAmountHuman);
  if (!Number.isFinite(minNum) || minNum < 0) {
    return { ok: false, message: "Invalid minimum token amount." };
  }
  const [whole = "0", frac = ""] = minAmountHuman.trim().split(".");
  const fracPadded = frac.slice(0, decimals).padEnd(decimals, "0");
  const minRaw = BigInt(whole) * BigInt(10 ** decimals) + BigInt(fracPadded || "0");
  const ok = balanceRaw >= minRaw;
  return {
    ok,
    message: ok ? undefined : `Minimum token balance not met. Required at least ${minAmountHuman} tokens.`,
  };
}
