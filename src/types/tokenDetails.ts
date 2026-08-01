export type SocialLinkPlatform =
  | "x"
  | "telegram"
  | "discord"
  | "github"
  | "youtube"
  | "whitepaper"
  | "external";

export interface SocialLinkItem {
  platform: SocialLinkPlatform;
  url: string;
}

/** Array of links; each has platform + url. Replaces legacy flat object. */
export type SocialLinks = SocialLinkItem[];

/** Audit provider ids matching frontend config */
export type AuditProviderId =
  | "certik"
  | "hacken"
  | "solidproof"
  | "coinsult"
  | "cyberscope"
  | "assuredefi"
  | "freshcoins"
  | "cfgninja"
  | "spywolf"
  | "interfi"
  | "other";

/** KYC provider ids matching frontend config */
export type KycProviderId =
  | "certik"
  | "pinksale"
  | "hacken"
  | "cyberscope"
  | "assuredefi"
  | "freshcoins"
  | "coinsult"
  | "solidproof"
  | "spywolf"
  | "interfi"
  | "other";

export interface AuditKycDetails {
  auditProvider?: AuditProviderId;
  auditLink?: string;
  kycProvider?: KycProviderId;
  kycLink?: string;
}

/** Vote listing platform ids: FreshCoins, CoinSniper, Cryptach */
export type ListingPlatformId = "freshcoins" | "coinsniper" | "cryptach";

export interface ListingPlatformEntry {
  providerId: ListingPlatformId;
  url: string;
}

export type ListingPlatforms = ListingPlatformEntry[];

export interface InstallationSteps {
  tokenDetailsStepCompleted?: boolean;
  logoStepCompleted?: boolean;
  descriptionStepCompleted?: boolean;
  socialLinksStepCompleted?: boolean;
  templateStepCompleted?: boolean;
  auditKycStepCompleted?: boolean;
}

export type VestingDuration =
  | "3 months"
  | "6 months"
  | "1 year"
  | "2 years"
  | "3 years";

export interface TokenFeatures {
  /** Common: EVM + Solana */
  liquidityLocked?: boolean;
  teamVesting?: boolean;
  teamVestingDuration?: VestingDuration;
  transactionTaxRates?: boolean;
  sellTax?: number;
  buyTax?: number;
  transferTax?: number;
  /** EVM only */
  contractRenounced?: boolean;
  burnMechanism?: boolean;
  stakingRewards?: boolean;
  /** Solana only */
  mintAuthorityRevoked?: boolean;
  freezeAuthorityRevoked?: boolean;
  updateAuthorityRevoked?: boolean;
}

export interface TokenDetails {
  address?: string;
  chain?: string;
  dexUrl?: string;
  name?: string;
  symbol?: string;
  logo?: string;
  description?: string;
  social?: {
    twitter?: string;
    telegram?: string;
    discord?: string;
    website?: string;
  };
  launchType?: string;
  launchPlatformUrl?: string;
  tokenFeatures?: TokenFeatures;
  decimals?: number;
  price?: number;
  market_cap?: number;
  market_cap_diluted?: number;
  volume?: number;
  volume_change_24h?: number | null;
  volume_7d?: number | null;
  liquidity?: number;
  price_change_24h?: number;
  total_supply?: number;
  circulating_supply?: number;
}
