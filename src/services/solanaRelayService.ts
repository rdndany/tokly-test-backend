/**
 * Backend Solana relayer: submits airdrop batch transactions so the user only signs once (fund + batch 1).
 * drop_tokens does not require the owner to sign—the airdrop PDA authorizes the vault, so we can sign as fee payer.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstructionWithDerivation,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const bs58 = require("bs58") as { decode(s: string): Uint8Array };

/** Must match frontend and deployed program. */
const SOLANA_AIRDROP_PROGRAM_ID = "5Kg6HhfSQwAU67WRaKbBo1WMUkUmkXyCPatG15gHbAUB";
const PROGRAM_ID = new PublicKey(SOLANA_AIRDROP_PROGRAM_ID);

const DROP_TOKENS_DISCRIMINATOR = Buffer.from([157, 99, 197, 51, 162, 199, 46, 135]);

const BATCH_SIZE = 5;

function encodeU64(value: number | bigint): Buffer {
  const n = typeof value === "bigint" ? value : BigInt(value);
  const buf = Buffer.alloc(8);
  buf.writeBigUint64LE(n);
  return buf;
}

function getVaultPda(airdrop: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), airdrop.toBuffer()],
    PROGRAM_ID
  );
}

/** Recipient ATA. allowOwnerOffCurve: true so PDA recipients (e.g. from other programs) are supported. */
function getRecipientAta(mint: PublicKey, recipient: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, recipient, true);
}

function buildDropTokensIx(params: {
  airdropPda: PublicKey;
  vault: PublicKey;
  recipientTokenAccount: PublicKey;
  mint: PublicKey;
  amount: number | bigint;
}): TransactionInstruction {
  const data = Buffer.alloc(8 + 8);
  data.set(DROP_TOKENS_DISCRIMINATOR, 0);
  data.set(encodeU64(params.amount), 8);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: params.airdropPda, isSigner: false, isWritable: true },
      { pubkey: params.vault, isSigner: false, isWritable: true },
      { pubkey: params.recipientTokenAccount, isSigner: false, isWritable: true },
      { pubkey: params.mint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/** Idempotent create ATA; allowOwnerOffCurve: true for PDA recipients. No-op if ATA already exists. */
function createAtaIdempotentIx(params: {
  mint: PublicKey;
  owner: PublicKey;
  payer: PublicKey;
}): TransactionInstruction {
  return createAssociatedTokenAccountIdempotentInstructionWithDerivation(
    params.payer,
    params.owner,
    params.mint,
    true
  );
}

export interface ContinueDistributionParams {
  airdropPda: string;
  mint: string;
  recipientAddresses: string[];
  amountPerRecipientBase: number;
  cluster?: "devnet" | "mainnet-beta";
  /** Called after each batch is sent so the client can update progress in real time. */
  onBatchComplete?: (signature: string) => void | Promise<void>;
}

export interface ContinueDistributionResult {
  signatures: string[];
  error?: string;
}

/** Parse relayer keypair from env. Returns null if not set or invalid. */
function getRelayerKeypair(): Keypair | null {
  const secretKey = process.env.SOLANA_RELAYER_SECRET_KEY;
  if (!secretKey?.trim()) return null;
  try {
    const decoded = Buffer.from(secretKey, "base64");
    if (decoded.length === 64) return Keypair.fromSecretKey(new Uint8Array(decoded));
  } catch {
    // continue
  }
  try {
    const decoded = bs58.decode(secretKey);
    if (decoded.length === 64) return Keypair.fromSecretKey(new Uint8Array(decoded));
  } catch {
    // continue
  }
  try {
    const arr = JSON.parse(secretKey) as number[];
    return Keypair.fromSecretKey(new Uint8Array(arr));
  } catch {
    return null;
  }
}

export interface SolanaRelayerInfo {
  address: string;
  balanceSol: number;
  cluster: string;
  testOnly: boolean;
  /** Set when RPC failed or timed out; balanceSol may be 0. */
  error?: string;
}

/** Solana: ~5k lamports per tx + ATA rent ~2.04e6 per new account; up to 5 ATAs per batch. Conservative per-batch estimate. */
const LAMPORTS_PER_TX = 5_000;
const LAMPORTS_PER_ATA_RENT = 2_039_280;
const LAMPORTS_PER_BATCH_ESTIMATE = LAMPORTS_PER_TX + 5 * LAMPORTS_PER_ATA_RENT; // ~10.2e6
const FEE_BUFFER_MULTIPLIER = 1.1; // 10% stays in relayer

export interface SolanaRelayerFeeEstimate {
  lamports: number;
  lamportsWithBuffer: number;
  relayerAddress: string;
  batchCount: number;
}

/**
 * Estimate SOL needed to pay for N batches (relayer executes; user pays in one tx). Includes 10% buffer for relayer.
 */
export function getSolanaRelayerFeeEstimate(batchCount: number): SolanaRelayerFeeEstimate | null {
  const keypair = getRelayerKeypair();
  if (!keypair || batchCount < 1) return null;
  const lamports = batchCount * LAMPORTS_PER_BATCH_ESTIMATE;
  const lamportsWithBuffer = Math.ceil(lamports * FEE_BUFFER_MULTIPLIER);
  return {
    lamports,
    lamportsWithBuffer,
    relayerAddress: keypair.publicKey.toBase58(),
    batchCount,
  };
}

const RELAYER_INFO_RPC_TIMEOUT_MS = 10_000;

const PUBLIC_DEVNET_RPC = "https://api.devnet.solana.com";
const PUBLIC_MAINNET_RPC = "https://api.mainnet-beta.solana.com";

/** Resolve RPC URL for cluster. Prefers SOLANA_DEVNET_RPC_URL / SOLANA_MAINNET_RPC_URL, then SOLANA_RPC_URL, then public. */
export function getRpcUrl(cluster: "devnet" | "mainnet-beta"): string {
  if (cluster === "mainnet-beta") {
    return process.env.SOLANA_MAINNET_RPC_URL ?? process.env.SOLANA_RPC_URL ?? PUBLIC_MAINNET_RPC;
  }
  return process.env.SOLANA_DEVNET_RPC_URL ?? process.env.SOLANA_RPC_URL ?? PUBLIC_DEVNET_RPC;
}

/**
 * Verify that a payment transaction is confirmed on-chain. Used to gate the relayer: we only run
 * batches after the user has paid (so batches cannot start before payment is confirmed).
 * Retries a few times in case RPC has not indexed the tx yet.
 */
export async function verifyPaymentTransaction(
  cluster: "devnet" | "mainnet-beta",
  signature: string
): Promise<boolean> {
  if (!signature?.trim()) return false;
  const rpcUrl = getRpcUrl(cluster);
  const connection = new Connection(rpcUrl, "confirmed");
  const maxAttempts = 3;
  const delayMs = 2000;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const tx = await connection.getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      if (tx && tx.meta?.err == null) return true;
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, delayMs));
    } catch {
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

/**
 * Get relayer account info (address + SOL balance) for display.
 * cluster: use project's airdrop chain so balance matches the network where airdrop runs.
 * RPC getBalance is wrapped in a timeout so the request never hangs indefinitely.
 */
export async function getSolanaRelayerInfo(
  cluster: "devnet" | "mainnet-beta" = "devnet"
): Promise<SolanaRelayerInfo | null> {
  const keypair = getRelayerKeypair();
  if (!keypair) return null;
  const rpcUrl = getRpcUrl(cluster);
  const connection = new Connection(rpcUrl, "confirmed");
  const testOnly = cluster === "devnet";
  let balance: number;
  try {
    balance = await Promise.race([
      connection.getBalance(keypair.publicKey),
      new Promise<number>((_, reject) =>
        setTimeout(() => reject(new Error("RPC timeout")), RELAYER_INFO_RPC_TIMEOUT_MS)
      ),
    ]);
  } catch {
    return {
      address: keypair.publicKey.toBase58(),
      balanceSol: 0,
      cluster,
      testOnly,
      error: "RPC timeout or unavailable",
    };
  }
  const balanceSol = balance / 1e9;
  return {
    address: keypair.publicKey.toBase58(),
    balanceSol,
    cluster,
    testOnly,
  };
}

/**
 * Send remaining airdrop batches using the relayer keypair (no user signature).
 * Relayer pays for tx fees and ATA creation rent.
 */
export async function continueSolanaDistribution(
  params: ContinueDistributionParams
): Promise<ContinueDistributionResult> {
  const keypair = getRelayerKeypair();
  if (!keypair) {
    return { signatures: [], error: "SOLANA_RELAYER_SECRET_KEY is not configured" };
  }

  const cluster = params.cluster === "mainnet-beta" ? "mainnet-beta" : "devnet";
  const rpcUrl = getRpcUrl(cluster);
  const hasCustomRpc =
    (cluster === "mainnet-beta" && process.env.SOLANA_MAINNET_RPC_URL) ||
    (cluster === "devnet" && process.env.SOLANA_DEVNET_RPC_URL) ||
    process.env.SOLANA_RPC_URL;
  if (!hasCustomRpc) {
    console.warn(
      `[Solana relayer] No custom RPC set for ${cluster} – using public RPC. Set SOLANA_DEVNET_RPC_URL / SOLANA_MAINNET_RPC_URL (or SOLANA_RPC_URL) in .env to avoid 429.`
    );
  }
  const connection = new Connection(rpcUrl, "confirmed");

  const airdropPda = new PublicKey(params.airdropPda);
  const mint = new PublicKey(params.mint);
  const [vaultPda] = getVaultPda(airdropPda);
  const payer = keypair.publicKey;

  const signatures: string[] = [];
  const addresses = params.recipientAddresses.filter((a) => a?.trim());
  const amount = params.amountPerRecipientBase;

  /** Delay between batches. Helius free: 1 sendTransaction/sec, 10 req/sec – use 6s+ to avoid 429. */
  const delayMs = Math.max(0, Number(process.env.SOLANA_RELAYER_DELAY_MS) || 6000);
  const delay = (ms?: number) => new Promise((r) => setTimeout(r, ms ?? delayMs));

  /** Space RPC calls within a batch so we stay under 10 req/s (1 req per 100ms). */
  const betweenRpcMs = Math.max(0, Number(process.env.SOLANA_RELAYER_BETWEEN_RPC_MS) || 1000);

  /** Retry backoff (ms) when RPC returns 429 Too Many Requests. */
  const retryDelays = [10000, 20000, 40000];
  const isRateLimit = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    return /429|too many requests/i.test(msg);
  };
  /** True when tx failed due to expired blockhash (retry with fresh blockhash). */
  const isBlockhashExpired = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    return /block height exceeded|blockhash expired|blockhash not found/i.test(msg);
  };

  /** Initial delay before first batch to avoid bursting on connection. */
  await delay(betweenRpcMs);

  for (let start = 0; start < addresses.length; start += BATCH_SIZE) {
    const batch = addresses.slice(start, start + BATCH_SIZE);
    const tx = new Transaction();

    const recipientPubkeys: PublicKey[] = [];
    const atas: PublicKey[] = [];
    for (const address of batch) {
      try {
        const recipientPubkey = new PublicKey(address);
        recipientPubkeys.push(recipientPubkey);
        atas.push(getRecipientAta(mint, recipientPubkey));
      } catch {
        continue;
      }
    }

    if (atas.length === 0) continue;

    await delay(betweenRpcMs);

    for (let i = 0; i < recipientPubkeys.length; i++) {
      const recipientPubkey = recipientPubkeys[i];
      const recipientAta = atas[i];
      tx.add(createAtaIdempotentIx({ mint, owner: recipientPubkey, payer }));
      tx.add(
        buildDropTokensIx({
          airdropPda,
          vault: vaultPda,
          recipientTokenAccount: recipientAta,
          mint,
          amount,
        })
      );
    }

    if (tx.instructions.length === 0) continue;

    const maxAttempts = 4;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        if (attempt > 0) await delay(attempt === 1 ? 2000 : retryDelays[Math.min(attempt - 2, retryDelays.length - 1)]);
        await delay(betweenRpcMs);
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;
        tx.lastValidBlockHeight = lastValidBlockHeight;
        tx.feePayer = payer;
        await delay(betweenRpcMs);
        const sig = await sendAndConfirmTransaction(connection, tx, [keypair], {
          skipPreflight: false,
          maxRetries: 5,
          commitment: "confirmed",
        });
        signatures.push(sig);
        if (params.onBatchComplete) {
          await Promise.resolve(params.onBatchComplete(sig));
        }
        break;
      } catch (err) {
        const canRetry = isRateLimit(err) || isBlockhashExpired(err);
        if (!canRetry || attempt >= maxAttempts - 1) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            signatures,
            error: `Batch ${signatures.length + 1} failed: ${msg}`,
          };
        }
      }
    }
    await delay();
  }

  return { signatures };
}
