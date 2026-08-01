import config from "../config";
import ProjectModel from "../models/Project";
import { getOrCreateDefaultWorkspace } from "./workspaceService";
import {
  createProject,
  getProjectById,
  updateProjectPublishAddress,
  updateProjectVisibility,
  updateProjectListingPlatforms,
  updateProjectRoadmap,
  updateProjectSocialLinks,
  updateProjectAuditKyc,
  updateProjectTeam,
  updateProjectFAQ,
  updateProjectTemplate,
  updateProjectTokenDescription,
  updateProjectTokenDetails,
  updateProjectTokenDetailsByNameSymbol,
  updateProjectTokenFeatures,
  updateProjectTokenLogo,
  updateProjectTokenomics,
  updateProjectDexUrl,
  updateProjectLaunchDetails,
  generateHeroTextFromPlainDescription,
  rewritePlainDescriptionForPartnerCreate,
} from "./projectService";
import { fetchTokenDetails } from "./mobulaService";
import { getTokenSecurity } from "./goplusService";
import { getDexUrlForBlockchain } from "../utils/dexUtils";
import type { TokenFeatures } from "../types/tokenDetails";
import { completeOnboarding } from "./onboardingService";
import type { PartnerCreatePayload } from "../types/partnerCreate";
import { DUMMY_PARTNER_CREATE_PAYLOAD } from "../types/partnerCreate";
import type { SocialLinkItem } from "../types/tokenDetails";
import { plainTextToLexicalJSON } from "../utils/lexicalHelpers";
import { createLogger } from "../utils/logger";

const logger = createLogger("PartnerCreateService");

const DEFAULT_TEMPLATE = "zynex";

function mapSocialLinks(social: PartnerCreatePayload["social"]): SocialLinkItem[] {
  if (!social) return [];
  const map: Array<[SocialLinkItem["platform"], string | undefined]> = [
    ["x", social.twitter],
    ["telegram", social.telegram],
    ["discord", social.discord],
    ["github", social.github],
    ["youtube", social.youtube],
    ["whitepaper", social.whitepaper],
  ];
  return map
    .filter(([, url]) => typeof url === "string" && url.trim())
    .map(([platform, url]) => ({ platform, url: url!.trim() }));
}

const LISTING_PLATFORM_IDS = ["freshcoins", "coinsniper", "cryptach"] as const;

function defaultListingProviderId(partner?: string): string {
  const id = partner?.trim().toLowerCase();
  if (LISTING_PLATFORM_IDS.includes(id as (typeof LISTING_PLATFORM_IDS)[number])) {
    return id!;
  }
  return "coinsniper";
}

function resolveMergedSocial(payload: PartnerCreatePayload): PartnerCreatePayload["social"] {
  const social = payload.social ?? {};
  const twitter =
    payload.content?.social?.twitter?.trim() ||
    social.twitter?.trim() ||
    (typeof (social as Record<string, unknown>).x === "string"
      ? ((social as Record<string, unknown>).x as string).trim()
      : undefined);

  return {
    twitter,
    telegram: payload.content?.social?.telegram ?? social.telegram,
    discord: payload.content?.social?.discord ?? social.discord,
    github: payload.content?.social?.github ?? social.github,
    youtube: payload.content?.social?.youtube ?? social.youtube,
    whitepaper: payload.content?.social?.whitepaper ?? social.whitepaper,
  };
}

function resolveSocialLinks(payload: PartnerCreatePayload): SocialLinkItem[] {
  const links = mapSocialLinks(resolveMergedSocial(payload));
  for (const url of payload.content?.extraSocialUrls ?? []) {
    const trimmed = typeof url === "string" ? url.trim() : "";
    if (trimmed) links.push({ platform: "external", url: trimmed });
  }
  return links;
}

function resolveListingPlatforms(
  payload: PartnerCreatePayload
): Array<{ providerId: string; url: string }> {
  const fromContent = (payload.content?.listingPlatforms ?? []).filter(
    (entry) => entry.providerId?.trim() && entry.url?.trim()
  );
  if (fromContent.length > 0) {
    return fromContent.map((entry) => ({
      providerId: entry.providerId.trim(),
      url: entry.url.trim(),
    }));
  }

  const fromListing = (payload.listing?.platforms ?? []).filter(
    (entry) => entry.providerId?.trim() && entry.url?.trim()
  );
  if (fromListing.length > 0) {
    return fromListing.map((entry) => ({
      providerId: entry.providerId.trim(),
      url: entry.url.trim(),
    }));
  }

  const listingUrl = payload.listing?.listingUrl?.trim();
  if (!listingUrl) return [];

  return [{ providerId: defaultListingProviderId(payload.partner), url: listingUrl }];
}

function resolveAuditKyc(payload: PartnerCreatePayload): {
  auditProvider?: string;
  auditLink?: string;
  kycProvider?: string;
  kycLink?: string;
} {
  const auditProvider =
    payload.content?.auditProvider ?? payload.audit?.auditProvider?.trim() ?? undefined;
  const auditLink =
    payload.content?.auditLink ?? payload.audit?.auditLink?.trim() ?? undefined;
  const kycProvider =
    payload.content?.kycProvider ?? payload.audit?.kycProvider?.trim() ?? undefined;
  const kycLink =
    payload.content?.kycLink ?? payload.audit?.kycLink?.trim() ?? undefined;

  return {
    auditProvider,
    auditLink: auditProvider && auditLink ? auditLink : undefined,
    kycProvider,
    kycLink: kycProvider && kycLink ? kycLink : undefined,
  };
}

/** Skip /getting-started for partner signups — auto-complete with a generated handle. */
async function ensurePartnerUserOnboarding(userId: string, displayName?: string): Promise<void> {
  const suffix = userId.replace(/\W/g, "").slice(-8).toLowerCase() || "user";
  const handle = `cs_${suffix}`.slice(0, 30);
  try {
    await completeOnboarding(userId, {
      fullName: displayName?.trim() || "Partner User",
      companyRole: "founder",
      companySize: "solo",
      theme: "dark",
      handle,
    });
  } catch (err) {
    logger.warn("Partner onboarding auto-complete failed (non-fatal):", err);
  }
}

export async function createProjectFromPartnerCreatePayload(
  userId: string,
  payload: PartnerCreatePayload,
  workspaceId?: string,
  deployment?: { subdomain: string; domain: string },
  sectionCustomization?: Record<string, { layout?: { type?: string } }>
) {
  const wsId =
    workspaceId?.trim() ||
    (await getOrCreateDefaultWorkspace(userId)).id;

  const token = payload.token ?? {};
  const partnerId = payload.partner?.trim().toLowerCase() || "";
  const ref = payload.ref?.trim() || partnerId || "partner";
  const title =
    token.name?.trim() && token.symbol?.trim()
      ? `${token.name.trim()} (${token.symbol.trim()})`
      : undefined;

  const project = await createProject({
    userId,
    workspaceId: wsId,
    prompt: `Partner create: ${ref}`,
    title,
  });

  const projectId = project.id;

  if (token.address?.trim() && token.chain?.trim()) {
    try {
      await updateProjectTokenDetails(userId, projectId, {
        address: token.address.trim(),
        chain: token.chain.trim(),
        logo: token.logo?.trim(),
        fromQuestionnaire: true,
      });
    } catch (err) {
      logger.warn("Mobula token fetch failed, falling back to name/symbol:", err);
      if (token.name?.trim() && token.symbol?.trim()) {
        await updateProjectTokenDetailsByNameSymbol(userId, projectId, {
          name: token.name.trim(),
          symbol: token.symbol.trim(),
          launchType: token.launchType?.trim(),
          launchPlatformUrl: token.launchPlatformUrl?.trim(),
          fromQuestionnaire: true,
        });
      }
    }
  } else if (token.name?.trim() && token.symbol?.trim()) {
    await updateProjectTokenDetailsByNameSymbol(userId, projectId, {
      name: token.name.trim(),
      symbol: token.symbol.trim(),
      launchType: token.launchType?.trim(),
      launchPlatformUrl: token.launchPlatformUrl?.trim(),
      fromQuestionnaire: true,
    });
  }

  if (token.logo?.trim()) {
    await updateProjectTokenLogo(userId, projectId, { logo: token.logo.trim() });
  } else {
    await updateProjectTokenLogo(userId, projectId, { logo: undefined });
  }

  if (token.dexUrl?.trim()) {
    await updateProjectDexUrl(userId, projectId, { dexUrl: token.dexUrl.trim() });
  }

  if (token.tokenFeatures && Object.keys(token.tokenFeatures).length > 0) {
    try {
      await updateProjectTokenFeatures(userId, projectId, token.tokenFeatures);
    } catch (err) {
      logger.warn("Partner token features skipped:", err);
    }
  }

  if (token.launchType?.trim() || token.launchPlatformUrl?.trim()) {
    await updateProjectLaunchDetails(userId, projectId, {
      launchType: token.launchType?.trim(),
      launchPlatformUrl: token.launchPlatformUrl?.trim(),
    });
  }

  const descriptionPlain =
    payload.content?.description?.trim() ||
    token.description?.trim() ||
    "";
  const heroPlain =
    payload.content?.heroText?.trim() ||
    token.heroText?.trim() ||
    "";

  const descriptionLexical = descriptionPlain
    ? plainTextToLexicalJSON(descriptionPlain)
    : undefined;
  const heroLexical = heroPlain
    ? plainTextToLexicalJSON(heroPlain)
    : undefined;

  if (descriptionLexical || heroLexical) {
    await updateProjectTokenDescription(userId, projectId, {
      ...(descriptionLexical ? { description: descriptionLexical } : {}),
      ...(heroLexical ? { heroText: heroLexical } : {}),
    });
  }

  const content = payload.content;
  if (content && (content.totalSupply?.trim() || (content.allocations?.length ?? 0) > 0)) {
    try {
      await updateProjectTokenomics(userId, projectId, {
        totalSupply: content.totalSupply?.trim(),
        allocations: content.allocations?.map((a) => ({
          id: a.id,
          name: a.name,
          percentage: a.percentage,
          color: a.color ?? "#10B981",
        })),
      });
    } catch (err) {
      logger.warn("Partner tokenomics skipped (invalid or incomplete):", err);
    }
  }

  if (content && (content.phases?.length ?? 0) > 0) {
    try {
      await updateProjectRoadmap(userId, projectId, {
        phases: content.phases?.map((p) => ({
          id: p.id,
          name: p.name,
          milestones: (p.milestones ?? []).map((m) => ({
            id: m.id,
            text: m.text,
            completed: Boolean(m.completed),
          })),
        })),
      });
    } catch (err) {
      logger.warn("Partner roadmap skipped (invalid or incomplete):", err);
    }
  }

  if (content && (content.teamMembers?.length ?? 0) > 0) {
    try {
      await updateProjectTeam(userId, projectId, {
        teamMembers: content.teamMembers?.map((m) => ({
          id: m.id,
          name: m.name,
          role: m.role,
          image: m.image,
          socials: m.socials ?? [],
        })),
      });
    } catch (err) {
      logger.warn("Partner team skipped (invalid or incomplete):", err);
    }
  }

  if (content && (content.faqItems?.length ?? 0) > 0) {
    try {
      await updateProjectFAQ(userId, projectId, {
        faqItems: content.faqItems?.map((f) => ({
          id: f.id,
          question: f.question,
          answer: f.answer,
        })),
      });
    } catch (err) {
      logger.warn("Partner FAQ skipped (invalid or incomplete):", err);
    }
  }

  await updateProjectTemplate(userId, projectId, {
    templateId: payload.design?.templateId?.trim() || DEFAULT_TEMPLATE,
    colorSchemaId: payload.design?.colorSchemaId?.trim(),
    fontFamily: payload.design?.fontFamily?.trim(),
  });

  await updateProjectSocialLinks(userId, projectId, {
    links: resolveSocialLinks(payload),
  });

  const listingPlatforms = resolveListingPlatforms(payload);
  if (listingPlatforms.length > 0) {
    await updateProjectListingPlatforms(userId, projectId, {
      platforms: listingPlatforms,
    });
  }

  const auditKyc = resolveAuditKyc(payload);
  if (auditKyc.auditProvider || auditKyc.kycProvider) {
    await updateProjectAuditKyc(userId, projectId, {
      auditProvider: auditKyc.auditProvider || "",
      auditLink: auditKyc.auditProvider ? auditKyc.auditLink || "" : "",
      kycProvider: auditKyc.kycProvider || "",
      kycLink: auditKyc.kycProvider ? auditKyc.kycLink || "" : "",
    });
  }

  await ProjectModel.findByIdAndUpdate(projectId, {
    $set: {
      installationSteps: {
        tokenDetailsStepCompleted: true,
        logoStepCompleted: true,
        descriptionStepCompleted: true,
        templateStepCompleted: true,
        socialLinksStepCompleted: true,
      },
    },
  });

  await ensurePartnerUserOnboarding(userId, token.name?.trim());

  if (deployment?.subdomain?.trim() && deployment?.domain?.trim()) {
    try {
      await updateProjectPublishAddress(userId, projectId, {
        subdomain: deployment.subdomain.trim(),
        domain: deployment.domain.trim(),
      });
      await updateProjectVisibility(userId, projectId, { projectVisibility: "public" });
    } catch (err) {
      logger.warn("Partner publish skipped:", err);
    }
  }

  if (sectionCustomization && Object.keys(sectionCustomization).length > 0) {
    await ProjectModel.findByIdAndUpdate(projectId, {
      $set: { sectionCustomization },
    });
  }

  const full = await getProjectById(projectId);
  if (!full) throw new Error("Project not found after creation");

  return {
    id: full.id,
    title: full.title,
    workspaceId: full.workspaceId?.toString?.() ?? wsId,
  };
}

export function isDemoPartnerCreateAllowed(): boolean {
  return config.nodeEnv === "development";
}

export function getDemoPartnerCreatePayload(): PartnerCreatePayload {
  return DUMMY_PARTNER_CREATE_PAYLOAD;
}

export interface PartnerCreateTokenPreview {
  address: string;
  chain: string;
  name?: string;
  symbol?: string;
  logo?: string;
  description?: string;
  dexUrl?: string;
  price?: number;
  market_cap?: number;
  volume?: number;
  liquidity?: number;
  price_change_24h?: number;
  total_supply?: number;
  circulating_supply?: number;
  tokenFeatures?: TokenFeatures;
}

/** Fetch Mobula token details (+ GoPlus security hints) for the partner create flow. */
export async function previewPartnerToken(
  address: string,
  chain: string
): Promise<PartnerCreateTokenPreview> {
  const trimmedAddress = address.trim();
  const trimmedChain = chain.trim();
  if (!trimmedAddress || !trimmedChain) {
    throw new Error("address and chain are required");
  }

  const fetched = await fetchTokenDetails(trimmedAddress, trimmedChain);
  if (!fetched) {
    throw new Error(
      "Failed to verify token. Please check the address and blockchain, then try again."
    );
  }

  const preview: PartnerCreateTokenPreview = {
    address: trimmedAddress,
    chain: trimmedChain,
    name: fetched.name,
    symbol: fetched.symbol,
    logo: fetched.logo,
    dexUrl: getDexUrlForBlockchain(trimmedChain, trimmedAddress),
    price: fetched.price,
    market_cap: fetched.market_cap,
    volume: fetched.volume,
    liquidity: fetched.liquidity,
    price_change_24h: fetched.price_change_24h,
    total_supply: fetched.total_supply,
    circulating_supply: fetched.circulating_supply,
  };

  if (fetched.description?.trim()) {
    preview.description = await rewritePartnerCreateDescription(fetched.description);
  }

  const goPlus = await getTokenSecurity(trimmedChain, trimmedAddress);
  if (goPlus) {
    const tokenFeatures: TokenFeatures = {};
    if (goPlus.contractRenounced !== undefined) {
      tokenFeatures.contractRenounced = goPlus.contractRenounced;
    }
    if (goPlus.mintAuthority?.revoked !== undefined) {
      tokenFeatures.mintAuthorityRevoked = goPlus.mintAuthority.revoked;
    }
    if (goPlus.freezeAuthority?.revoked !== undefined) {
      tokenFeatures.freezeAuthorityRevoked = goPlus.freezeAuthority.revoked;
    }
    if (goPlus.updateAuthority?.revoked !== undefined) {
      tokenFeatures.updateAuthorityRevoked = goPlus.updateAuthority.revoked;
    }
    if (Object.keys(tokenFeatures).length > 0) {
      preview.tokenFeatures = tokenFeatures;
    }
  }

  return preview;
}

export async function generatePartnerCreateHeroText(description: string): Promise<string> {
  return generateHeroTextFromPlainDescription(description);
}

export async function rewritePartnerCreateDescription(description: string): Promise<string> {
  return rewritePlainDescriptionForPartnerCreate(description);
}
