/**
 * Attempts to extract token address and chain from a user message.
 * Supports formats like:
 * - "0x1234... chain: ethereum"
 * - "address: 0x1234, chain: base"
 * - "0x1234 on arbitrum"
 * - "0x1234 ethereum"
 * - "ethereum 0x1234..."
 * - Solana base58 addresses
 */
export function parseTokenAddressAndChain(
  message: string
): { address: string; chain: string } | null {
  const trimmed = message.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();

  // 1. Find address: EVM (0x + 40 hex) or Solana (base58, 32-44 chars)
  let address: string | null = null;
  const evmMatch = trimmed.match(/0x[a-fA-F0-9]{40}/);
  if (evmMatch) {
    address = evmMatch[0];
  } else if (lower.includes("solana") || lower.includes("sol ")) {
    // Solana: base58, 32-44 chars - only when chain indicates Solana
    const solanaMatch = trimmed.match(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/);
    if (solanaMatch) {
      const cand = solanaMatch[0];
      if (!cand.startsWith("0x")) address = cand;
    }
  }

  if (!address) return null;

  // 2. Find chain - try explicit patterns first
  // "chain: ethereum" or "chain:ethereum" or "chain = ethereum"
  let chainMatch = lower.match(/(?:chain|network|blockchain)\s*[:\s=]\s*([a-z0-9\s]+?)(?:\s|,|$)/);
  if (chainMatch) {
    const chain = chainMatch[1].trim().replace(/\s+/g, " ");
    if (chain.length >= 2) return { address, chain: normalizeChain(chain) };
  }

  // "on ethereum" or "on base"
  chainMatch = lower.match(/\bon\s+([a-z0-9]+)/);
  if (chainMatch) {
    const chain = chainMatch[1].trim();
    if (chain.length >= 2) return { address, chain: normalizeChain(chain) };
  }

  // Comma-separated: "0x..., ethereum" or "0x..., base"
  const afterComma = trimmed.split(/,\s*/).slice(1).join(" ").toLowerCase();
  const chainFromComma = extractChainFromText(afterComma);
  if (chainFromComma) return { address, chain: chainFromComma };

  // 3. Known chain names anywhere in message
  const chainFromText = extractChainFromText(lower);
  if (chainFromText) return { address, chain: chainFromText };

  return null;
}

const KNOWN_CHAINS: Record<string, string> = {
  eth: "ethereum",
  ethereum: "ethereum",
  bsc: "bsc",
  "binance smart chain": "bsc",
  binance: "bsc",
  base: "base",
  arbitrum: "arbitrum",
  polygon: "polygon",
  matic: "polygon",
  avalanche: "avalanche",
  avax: "avalanche",
  optimism: "optimism",
  solana: "solana",
  sol: "solana",
  fantom: "fantom",
  ftm: "fantom",
  monad: "monad",
};

function normalizeChain(chain: string): string {
  const c = chain.toLowerCase().trim();
  return KNOWN_CHAINS[c] ?? c;
}

function extractChainFromText(text: string): string | null {
  const t = text.toLowerCase();
  // Prefer longer matches (e.g. "binance smart chain" before "binance")
  const ordered = [
    "binance smart chain",
    "ethereum",
    "arbitrum",
    "avalanche",
    "solana",
    "optimism",
    "polygon",
    "fantom",
    "base",
    "bsc",
    "eth",
    "avax",
    "sol",
    "matic",
    "ftm",
    "monad",
  ];
  for (const chain of ordered) {
    if (t.includes(chain)) return normalizeChain(chain);
  }
  return null;
}
