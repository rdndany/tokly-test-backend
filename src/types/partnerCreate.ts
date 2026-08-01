import type { TokenFeatures } from "./tokenDetails";

export interface PartnerCreateTokenPayload {
  name?: string;
  symbol?: string;
  description?: string;
  heroText?: string;
  logo?: string;
  address?: string;
  chain?: string;
  launchType?: string;
  launchPlatformUrl?: string;
  dexUrl?: string;
  tokenFeatures?: TokenFeatures;
  price?: number;
  market_cap?: number;
  volume?: number;
  liquidity?: number;
  price_change_24h?: number;
}

export interface PartnerCreateSocialPayload {
  twitter?: string;
  telegram?: string;
  discord?: string;
  github?: string;
  youtube?: string;
  whitepaper?: string;
}

export interface PartnerCreateDesignPayload {
  templateId?: string;
  colorSchemaId?: string;
  fontFamily?: string;
}

export interface PartnerCreateTokenAllocationPayload {
  id: string;
  name: string;
  percentage: number;
  color?: string;
}

export interface PartnerCreateRoadmapMilestonePayload {
  id: string;
  text: string;
  completed?: boolean;
}

export interface PartnerCreateRoadmapPhasePayload {
  id: string;
  name: string;
  milestones: PartnerCreateRoadmapMilestonePayload[];
}

export interface PartnerCreateTeamMemberPayload {
  id: string;
  name: string;
  role: string;
  image?: string;
  socials?: Array<{ type: string; url: string }>;
}

export interface PartnerCreateFAQItemPayload {
  id: string;
  question: string;
  answer: string;
}

export interface PartnerCreateContentPayload {
  description?: string;
  heroText?: string;
  totalSupply?: string;
  allocations?: PartnerCreateTokenAllocationPayload[];
  phases?: PartnerCreateRoadmapPhasePayload[];
  teamMembers?: PartnerCreateTeamMemberPayload[];
  faqItems?: PartnerCreateFAQItemPayload[];
  social?: PartnerCreateSocialPayload;
  extraSocialUrls?: string[];
  auditProvider?: string;
  auditLink?: string;
  kycProvider?: string;
  kycLink?: string;
  listingPlatforms?: Array<{ providerId: string; url: string }>;
}

export interface PartnerCreateListingPayload {
  listingUrl?: string;
  platforms?: Array<{ providerId: string; url: string }>;
}

export interface PartnerCreateAuditPayload {
  auditProvider?: string;
  auditLink?: string;
  kycProvider?: string;
  kycLink?: string;
}

export interface PartnerCreatePayload {
  partner?: string;
  ref?: string;
  token?: PartnerCreateTokenPayload;
  social?: PartnerCreateSocialPayload;
  design?: PartnerCreateDesignPayload;
  content?: PartnerCreateContentPayload;
  listing?: PartnerCreateListingPayload;
  audit?: PartnerCreateAuditPayload;
}

export const DUMMY_PARTNER_CREATE_PAYLOAD: PartnerCreatePayload = {
  partner: "coinsniper",
  ref: "demo-listing-001",
  token: {
    name: "MOBAMBO",
    symbol: "MOBAMBO",
    logo: "https://v2-api.coinsniper.net/storage/logos/040X8u3xc3frVqCOZrRHs955s57OCtnSKLpk5hHh.png",
    address: "ppD2YACYxh36zS2yDWwMiCkqfQgTukJ9P2a2jMQpump",
    chain: "solana",
    description:
      "MOBAMBO is a community-driven memecoin built for degens who love memes and going to the moon.",
    heroText: "The MOBAMBO army is assembling. Are you in?",
  },
  social: {
    twitter: "https://x.com/example",
    telegram: "https://t.me/example",
    discord: "https://discord.gg/example",
  },
  design: {
    templateId: "zynex",
    colorSchemaId: "zynex-indigo-violet",
    fontFamily: "poppins",
  },
  listing: {
    listingUrl: "https://coinsniper.net/coin/mobambo",
  },
  audit: {
    auditProvider: "certik",
    auditLink: "https://skynet.certik.com/projects/example",
    kycProvider: "assuredefi",
    kycLink: "https://assuredefi.io/projects/example",
  },
};
