/**
 * Build a token brief for chat responses - a clean summary of token details.
 */
function formatNum(n: number, noDecimals = false): string {
  const f = (x: number) => (noDecimals ? Math.round(x) : Number(x.toFixed(2)));
  if (n >= 1e12) return f(n / 1e12) + "T";
  if (n >= 1e9) return f(n / 1e9) + "B";
  if (n >= 1e6) return f(n / 1e6) + "M";
  if (n >= 1e3) return f(n / 1e3) + "K";
  if (n >= 1) return noDecimals ? String(Math.round(n)) : n.toFixed(2);
  if (n > 0 && n < 1) return noDecimals ? String(Math.round(n)) : n.toFixed(6);
  return String(n);
}

export interface TokenBriefInput {
  name?: string;
  symbol?: string;
  price?: number;
  market_cap?: number;
  liquidity?: number;
  price_change_24h?: number;
  volume?: number;
  circulating_supply?: number;
}

export function buildTokenBrief(
  td: TokenBriefInput | undefined,
  fallbackSummary?: string
): string {
  const hasDetails =
    td &&
    (td.name || td.symbol || td.price != null || td.market_cap != null);

  if (!hasDetails && !fallbackSummary) {
    return "I've saved your token details. Next, add your token logo above.";
  }

  if (!hasDetails && fallbackSummary) {
    return `I've saved your token details — ${fallbackSummary}. Next, add your token logo above.`;
  }

  if (!td) return "I've saved your token details. Next, add your token logo above.";

  const tokenName =
    td.symbol && td.name
      ? `${td.symbol} (${td.name})`
      : [td.symbol, td.name].filter(Boolean).join(" ");
  const parts: string[] = [];

  if (tokenName) {
    parts.push(`I've saved your token details for **${tokenName}**`);
  } else {
    parts.push("I've saved your token details");
  }

  const stats: string[] = [];
  if (td.price != null) stats.push(`trading at $${formatNum(td.price)}`);
  if (td.market_cap != null) stats.push(`$${formatNum(td.market_cap, true)} market cap`);
  if (td.price_change_24h != null) {
    const sign = td.price_change_24h >= 0 ? "up" : "down";
    const pct = Math.abs(td.price_change_24h).toFixed(2);
    stats.push(`${sign} ${pct}% in 24h`);
  }
  if (td.liquidity != null && td.liquidity > 0)
    stats.push(`$${formatNum(td.liquidity, true)} liquidity`);
  if (td.volume != null && td.volume > 0)
    stats.push(`$${formatNum(td.volume, true)} in 24h volume`);

  if (stats.length > 0) {
    parts.push(`— currently ${stats.join(", ")}.`);
  } else if (tokenName) {
    parts.push(".");
  }

  parts.push(" Next, we need to set the project logo.");
  return parts.join(" ");
}
