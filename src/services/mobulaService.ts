import config from "../config";
import type { TokenDetails } from "../types/tokenDetails";
import { createLogger } from "../utils/logger";

const logger = createLogger("MobulaService");

const DETAILS_URL = "https://api.mobula.io/api/2/token/details";

/** Mobula API v2 token/details response (subset we use) */
interface MobulaV2TokenDetailsResponse {
  data: {
    name: string;
    symbol: string;
    logo?: string;
    description?: string;
    decimals: number;
    priceUSD: number;
    marketCapUSD: number;
    marketCapDilutedUSD: number;
    volume24hUSD: number;
    priceChange24hPercentage?: number;
    liquidityUSD: number;
    totalSupply: number;
    circulatingSupply: number;
    [key: string]: unknown;
  };
}

/**
 * Map chain names to Mobula v2 API format.
 * Our UI uses: ethereum, bsc, base, solana, monad
 */
function getMobulaBlockchain(chain: string): string {
  const v2Map: Record<string, string> = {
    eth: "evm:1",
    ethereum: "evm:1",
    bsc: "evm:56",
    "binance smart chain": "evm:56",
    base: "evm:8453",
    solana: "solana",
    monad: "monad",
  };
  return v2Map[chain.toLowerCase()] ?? chain;
}

function mapToTokenDetails(
  d: MobulaV2TokenDetailsResponse["data"],
  address: string,
  chain: string
): TokenDetails {
  return {
    address,
    chain,
    name: d.name ?? "",
    symbol: d.symbol ?? "",
    logo: d.logo ? String(d.logo) : undefined,
    description:
      typeof d.description === "string" && d.description.trim()
        ? d.description.trim()
        : undefined,
    decimals: Number(d.decimals) ?? 0,
    price: Number(d.priceUSD) ?? 0,
    market_cap: Number(d.marketCapUSD) ?? 0,
    market_cap_diluted: Number(d.marketCapDilutedUSD) ?? 0,
    volume: Number(d.volume24hUSD) ?? 0,
    volume_change_24h: null,
    volume_7d: null,
    liquidity: Number(d.liquidityUSD) ?? 0,
    price_change_24h: Number(d.priceChange24hPercentage) ?? 0,
    total_supply: Number(d.totalSupply) ?? 0,
    circulating_supply: Number(d.circulatingSupply) ?? 0,
  };
}

/**
 * Fetch token details from Mobula API v2.
 * GET /api/2/token/details?blockchain=...&address=...
 */
export async function fetchTokenDetails(
  address: string,
  chain: string
): Promise<TokenDetails | null> {
  const apiKey = config.mobula.apiKey;
  if (!apiKey) {
    logger.error("MOBULA_API_KEY is not set");
    return null;
  }

  const trimmedAddress = address.trim();
  if (!trimmedAddress || !chain) {
    logger.error("Address and chain are required");
    return null;
  }

  const blockchainId = getMobulaBlockchain(chain);
  const url = `${DETAILS_URL}?blockchain=${encodeURIComponent(blockchainId)}&address=${encodeURIComponent(trimmedAddress)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error("Mobula API error:", response.status, body);
      if (response.status === 404) {
        throw new Error(
          "Token not found. Please check the address and blockchain — the token may not exist or may not be listed yet."
        );
      }
      throw new Error("Failed to fetch token data. Please try again later.");
    }

    const json = (await response.json()) as MobulaV2TokenDetailsResponse;
    if (!json?.data) {
      logger.error("Invalid Mobula response format");
      return null;
    }

    return mapToTokenDetails(json.data, trimmedAddress, chain);
  } catch (err) {
    logger.error("Mobula API fetch error:", err);
    return null;
  }
}
