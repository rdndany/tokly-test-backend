/**
 * GoPlus Labs token security API integration.
 * - Solana: mint/freeze/update authority status
 * - EVM: contract renounced (owner is null address)
 */

const GOPLUS_BASE = "https://api.gopluslabs.io/api/v1";

const EVM_CHAIN_IDS: Record<string, number> = {
  bsc: 56,
  eth: 1,
  ethereum: 1,
  base: 8453,
  monad: 143,
};

export interface TokenSecurityTokenomics {
  contractRenounced?: boolean;
  mintAuthority?: { revoked: boolean };
  freezeAuthority?: { revoked: boolean };
  updateAuthority?: { revoked: boolean };
}

interface SolanaTokenSecurityResult {
  balance_mutable_authority?: { authority: unknown[]; status: string };
  closable?: { authority: unknown[]; status: string };
  freezable?: { authority: unknown[]; status: string };
  mintable?: { authority: unknown[]; status: string };
  metadata_mutable?: { metadata_upgrade_authority: unknown[]; status: string };
  [key: string]: unknown;
}

interface EVMTokenSecurityResult {
  owner_address?: string;
  [key: string]: unknown;
}

function isAuthorityRevoked(
  obj: { authority?: unknown[]; status?: string } | undefined
): boolean {
  if (!obj) return false;
  const status = String(obj.status ?? "");
  const authority = obj.authority ?? [];
  return status === "0" && Array.isArray(authority) && authority.length === 0;
}

function isMetadataAuthorityRevoked(
  obj:
    | { metadata_upgrade_authority?: unknown[]; status?: string }
    | undefined
): boolean {
  if (!obj) return false;
  const status = String(obj.status ?? "");
  const authority = obj.metadata_upgrade_authority ?? [];
  return status === "0" && Array.isArray(authority) && authority.length === 0;
}

/**
 * Fetch Solana token security (mint/freeze/update authority).
 * Returns tokenomics-style flags: mintAuthority.revoked, freezeAuthority.revoked, updateAuthority.revoked.
 */
export async function getTokenSecuritySolana(
  contractAddress: string
): Promise<TokenSecurityTokenomics | null> {
  const trimmed = contractAddress.trim();
  if (!trimmed) return null;

  const url = `${GOPLUS_BASE}/solana/token_security?contract_addresses=${encodeURIComponent(trimmed)}`;

  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const data = (await res.json()) as {
      code?: number;
      result?: Record<string, SolanaTokenSecurityResult>;
    };

    if (data?.code !== 1 || !data.result) return null;

    const entry = data.result[trimmed];
    if (!entry) return null;

    const mintable = entry.mintable as SolanaTokenSecurityResult["mintable"];
    const freezable = entry.freezable as SolanaTokenSecurityResult["freezable"];
    const metadataMutable =
      entry.metadata_mutable as SolanaTokenSecurityResult["metadata_mutable"];

    return {
      mintAuthority: { revoked: isAuthorityRevoked(mintable) },
      freezeAuthority: { revoked: isAuthorityRevoked(freezable) },
      updateAuthority: {
        revoked: isMetadataAuthorityRevoked(metadataMutable),
      },
    };
  } catch {
    return null;
  }
}

/**
 * Normalize EVM address to lowercase for GoPlus.
 */
function normalizeEVMAddress(contractAddress: string): string {
  const trimmed = contractAddress.trim();
  if (trimmed.startsWith("0x")) return trimmed.toLowerCase();
  return `0x${trimmed}`.toLowerCase();
}

const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Fetch EVM token security (owner / renounced).
 * Returns tokenomics-style: contractRenounced when owner is null address.
 */
export async function getTokenSecurityEVM(
  blockchain: string,
  contractAddress: string
): Promise<TokenSecurityTokenomics | null> {
  const chainId =
    EVM_CHAIN_IDS[blockchain] ?? EVM_CHAIN_IDS[blockchain === "ethereum" ? "eth" : blockchain];
  if (chainId == null) return null;

  const normalized = normalizeEVMAddress(contractAddress);
  const url = `${GOPLUS_BASE}/token_security/${chainId}?contract_addresses=${encodeURIComponent(normalized)}`;

  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const data = (await res.json()) as {
      code?: number;
      result?: Record<string, EVMTokenSecurityResult>;
    };

    if (data?.code !== 1 || !data.result) return null;

    const entry = data.result[normalized];
    if (!entry) return null;

    const owner = (entry.owner_address ?? "").toLowerCase();
    const contractRenounced = owner === "" || owner === NULL_ADDRESS;

    return { contractRenounced };
  } catch {
    return null;
  }
}

/**
 * Fetch token security for a given blockchain and contract.
 * Returns partial tokenomicsFeatures to merge (contractRenounced for EVM; mint/freeze/update authority for Solana).
 */
export async function getTokenSecurity(
  blockchain: string,
  contractAddress: string
): Promise<TokenSecurityTokenomics | null> {
  const chain = blockchain.toLowerCase();
  const trimmed = contractAddress.trim();
  if (!trimmed) return null;

  if (chain === "solana") {
    return getTokenSecuritySolana(trimmed);
  }

  if (EVM_CHAIN_IDS[chain] != null || EVM_CHAIN_IDS[chain === "ethereum" ? "eth" : chain] != null) {
    return getTokenSecurityEVM(chain, trimmed);
  }

  return null;
}
