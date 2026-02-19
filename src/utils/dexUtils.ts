/**
 * Extracts token address from common DEX URL formats.
 * Returns the address if found, or null.
 */
export function extractTokenAddressFromDexUrl(url: string): string | null {
  if (!url?.trim()) return null;
  const u = url.trim();
  // outputMint (Raydium, Jupiter, etc.)
  const outputMint = u.match(/[?&]outputMint=([a-zA-Z0-9]+)/i);
  if (outputMint) return outputMint[1];
  // output (Pump.fun: swap.pump.fun/?output=...)
  const output = u.match(/[?&]output=([a-zA-Z0-9]{20,})/i);
  if (output) return output[1];
  // outputCurrency (Uniswap, PancakeSwap, SunSwap - EVM uses 0x)
  const outputCurrency = u.match(/[?&]outputCurrency=([a-zA-Z0-9]+)/i);
  if (outputCurrency) return outputCurrency[1];
  // inputMint (Solana - sometimes token is the input)
  const inputMint = u.match(/[?&]inputMint=([a-zA-Z0-9]+)/i);
  if (inputMint && inputMint[1] !== "sol" && inputMint[1].length > 20)
    return inputMint[1];
  return null;
}

/**
 * Returns the DEX swap URL for a given blockchain and token contract/mint address.
 * Based on tokly dexUtils. Used when token has address + chain (tradeable).
 */
export function getDexUrlForBlockchain(
  blockchain: string | undefined,
  contractAddress: string
): string {
  if (!blockchain?.trim() || !contractAddress?.trim()) return "";

  const chain = blockchain.toLowerCase();

  switch (chain) {
    case "solana":
      // Raydium: outputMint = token to receive, inputMint=sol for SOL as input
      return `https://raydium.io/swap/?outputMint=${contractAddress.trim()}&inputMint=sol`;
    case "bsc":
      // PancakeSwap on BSC (chainId 56)
      return `https://pancakeswap.finance/swap?outputCurrency=${contractAddress.trim()}&chainId=56`;
    case "eth":
    case "ethereum":
      return `https://app.uniswap.org/#/swap?outputCurrency=${contractAddress.trim()}`;
    case "base":
      return `https://app.uniswap.org/#/swap?chain=base&outputCurrency=${contractAddress.trim()}`;
    case "polygon":
    case "matic":
      return `https://app.uniswap.org/#/swap?chain=polygon&outputCurrency=${contractAddress.trim()}`;
    case "monad":
      return `https://app.uniswap.org/#/swap?chain=monad&outputCurrency=${contractAddress.trim()}`;
    case "tron":
      // SunSwap on Tron
      return `https://sunswap.com/#/swap?outputCurrency=${contractAddress.trim()}`;
    default:
      return "";
  }
}
