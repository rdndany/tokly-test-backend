import type { Request, Response } from "express";
import {
  createProjectFromPartnerCreatePayload,
  generatePartnerCreateHeroText,
  getDemoPartnerCreatePayload,
  isDemoPartnerCreateAllowed,
  previewPartnerToken,
} from "../services/partnerCreateService";
import { checkPublishUrlAvailability } from "../services/projectService";
import { verifyPartnerCreatePayload, decodePartnerCreatePayload, validatePartnerCreatePayload } from "../utils/partnerCreateCrypto";
import {
  getPartnerCreateSecret,
  isValidPartnerId,
  normalizePartnerId,
} from "../utils/partnerCreateSecrets";
import type {
  PartnerCreateContentPayload,
  PartnerCreateDesignPayload,
  PartnerCreatePayload,
} from "../types/partnerCreate";

function mergeDesignOverride(
  payload: PartnerCreatePayload,
  override: unknown
): PartnerCreatePayload {
  if (!override || typeof override !== "object") return payload;

  const raw = override as Record<string, unknown>;
  const design: PartnerCreateDesignPayload = { ...(payload.design ?? {}) };

  if (typeof raw.templateId === "string" && raw.templateId.trim()) {
    design.templateId = raw.templateId.trim();
  }
  if (typeof raw.colorSchemaId === "string") {
    const trimmed = raw.colorSchemaId.trim();
    design.colorSchemaId = trimmed || undefined;
  }
  if (typeof raw.fontFamily === "string") {
    const trimmed = raw.fontFamily.trim();
    design.fontFamily = trimmed || undefined;
  }

  return { ...payload, design };
}

function mergeContentOverride(
  payload: PartnerCreatePayload,
  override: unknown
): PartnerCreatePayload {
  if (!override || typeof override !== "object") return payload;

  const raw = override as Record<string, unknown>;
  const content: PartnerCreateContentPayload = { ...(payload.content ?? {}) };
  const token = { ...(payload.token ?? {}) };

  if (typeof raw.description === "string") {
    const trimmed = raw.description.trim();
    content.description = trimmed || undefined;
    token.description = trimmed || undefined;
  }
  if (typeof raw.heroText === "string") {
    const trimmed = raw.heroText.trim();
    content.heroText = trimmed || undefined;
    token.heroText = trimmed || undefined;
  }
  if (typeof raw.totalSupply === "string") {
    content.totalSupply = raw.totalSupply.trim() || undefined;
  }
  if (Array.isArray(raw.allocations)) {
    content.allocations = raw.allocations as PartnerCreateContentPayload["allocations"];
  }
  if (Array.isArray(raw.phases)) {
    content.phases = raw.phases as PartnerCreateContentPayload["phases"];
  }
  if (Array.isArray(raw.teamMembers)) {
    content.teamMembers = raw.teamMembers as PartnerCreateContentPayload["teamMembers"];
  }
  if (Array.isArray(raw.faqItems)) {
    content.faqItems = raw.faqItems as PartnerCreateContentPayload["faqItems"];
  }
  if (raw.social && typeof raw.social === "object") {
    content.social = raw.social as PartnerCreateContentPayload["social"];
  }
  if (Array.isArray(raw.extraSocialUrls)) {
    content.extraSocialUrls = raw.extraSocialUrls.filter(
      (value): value is string => typeof value === "string"
    );
  }
  if (typeof raw.auditProvider === "string") {
    content.auditProvider = raw.auditProvider.trim() || undefined;
  }
  if (typeof raw.auditLink === "string") {
    content.auditLink = raw.auditLink.trim() || undefined;
  }
  if (typeof raw.kycProvider === "string") {
    content.kycProvider = raw.kycProvider.trim() || undefined;
  }
  if (typeof raw.kycLink === "string") {
    content.kycLink = raw.kycLink.trim() || undefined;
  }
  if (Array.isArray(raw.listingPlatforms)) {
    content.listingPlatforms = raw.listingPlatforms as PartnerCreateContentPayload["listingPlatforms"];
  }

  return { ...payload, token, content };
}

function mergeBlockchainOverride(
  payload: PartnerCreatePayload,
  override: unknown
): PartnerCreatePayload {
  if (!override || typeof override !== "object") return payload;

  const raw = override as Record<string, unknown>;
  const token = { ...(payload.token ?? {}) };

  if (typeof raw.address === "string") {
    token.address = raw.address.trim() || undefined;
  }
  if (typeof raw.chain === "string") {
    token.chain = raw.chain.trim() || undefined;
  }
  if (typeof raw.dexUrl === "string") {
    token.dexUrl = raw.dexUrl.trim() || undefined;
  }
  if (typeof raw.name === "string") {
    token.name = raw.name.trim() || undefined;
  }
  if (typeof raw.symbol === "string") {
    token.symbol = raw.symbol.trim() || undefined;
  }
  if (typeof raw.logo === "string") {
    token.logo = raw.logo.trim() || undefined;
  }
  if (raw.tokenFeatures && typeof raw.tokenFeatures === "object") {
    token.tokenFeatures = raw.tokenFeatures as NonNullable<
      typeof token
    >["tokenFeatures"];
  }
  for (const key of [
    "price",
    "market_cap",
    "volume",
    "liquidity",
    "price_change_24h",
  ] as const) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      token[key] = value;
    }
  }

  const launchStatus =
    raw.launchStatus === "launched" || raw.launchStatus === "not_launched"
      ? raw.launchStatus
      : undefined;
  const launchType =
    raw.launchType === "presale" ||
    raw.launchType === "fair_launch" ||
    raw.launchType === "not_launched"
      ? raw.launchType
      : undefined;

  if (launchStatus === "launched") {
    token.launchType = "launched";
    token.launchPlatformUrl = undefined;
  } else if (launchStatus === "not_launched") {
    if (launchType === "presale" || launchType === "fair_launch") {
      token.launchType = launchType;
      if (typeof raw.launchPlatformUrl === "string") {
        token.launchPlatformUrl = raw.launchPlatformUrl.trim() || undefined;
      }
    } else {
      token.launchType = undefined;
      token.launchPlatformUrl = undefined;
    }
  } else if (typeof raw.launchPlatformUrl === "string") {
    token.launchPlatformUrl = raw.launchPlatformUrl.trim() || undefined;
  }

  return { ...payload, token };
}

function applyPartnerOverrides(
  payload: PartnerCreatePayload,
  body: Record<string, unknown>
): PartnerCreatePayload {
  let merged = mergeDesignOverride(payload, body.design);
  merged = mergeContentOverride(merged, body.content);
  merged = mergeBlockchainOverride(merged, body.blockchain);
  return merged;
}

function parseSectionCustomizationOverride(
  body: Record<string, unknown>
): Record<string, { layout?: { type?: string } }> | undefined {
  const raw = body.sectionCustomization;
  if (!raw || typeof raw !== "object") return undefined;

  const parsed: Record<string, { layout?: { type?: string } }> = {};
  for (const [sectionId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const entry = value as Record<string, unknown>;
    const layout = entry.layout;
    if (!layout || typeof layout !== "object") continue;
    const layoutType = (layout as Record<string, unknown>).type;
    if (typeof layoutType !== "string" || !layoutType.trim()) continue;
    parsed[sectionId] = { layout: { type: layoutType.trim() } };
  }

  return Object.keys(parsed).length > 0 ? parsed : undefined;
}

function parseDeploymentOverride(body: Record<string, unknown>): { subdomain: string; domain: string } | undefined {
  const raw = body.deployment;
  if (!raw || typeof raw !== "object") return undefined;

  const deployment = raw as Record<string, unknown>;
  const subdomain = typeof deployment.subdomain === "string" ? deployment.subdomain.trim().toLowerCase() : "";
  const domain = typeof deployment.domain === "string" ? deployment.domain.trim().toLowerCase() : "";
  if (!subdomain || !domain) return undefined;

  return { subdomain, domain };
}

function verifySignedPartnerPayload(
  encoded: string,
  sig: string
): { payload: PartnerCreatePayload } | { error: string; status: number } {
  if (!encoded?.trim()) {
    return { error: "Missing payload", status: 400 };
  }
  if (!sig?.trim()) {
    return { error: "Missing signature", status: 400 };
  }

  let decoded: PartnerCreatePayload;
  try {
    decoded = decodePartnerCreatePayload(encoded);
  } catch {
    return { error: "Invalid payload encoding", status: 400 };
  }

  const partnerId = normalizePartnerId(decoded.partner);
  if (!partnerId) {
    return { error: "Missing partner in payload", status: 400 };
  }
  if (!isValidPartnerId(partnerId)) {
    return { error: "Invalid partner id in payload", status: 400 };
  }

  const secret = getPartnerCreateSecret(partnerId);
  if (!secret) {
    return {
      error: `Partner signing secret is not configured for "${partnerId}"`,
      status: 400,
    };
  }

  const verified = verifyPartnerCreatePayload(encoded, sig, secret);
  if (!verified.ok) {
    return { error: verified.error, status: 400 };
  }

  return { payload: verified.payload };
}

function parseManualPayload(
  body: Record<string, unknown>
): { payload: PartnerCreatePayload } | { error: string; status: number } {
  const raw = body.manualPayload;
  if (!raw || typeof raw !== "object") {
    return { error: "Missing manualPayload", status: 400 };
  }

  const payload = raw as PartnerCreatePayload;
  const err = validatePartnerCreatePayload(payload);
  if (err) {
    return { error: err, status: 400 };
  }

  return { payload };
}

function resolvePayload(req: Request): { payload: PartnerCreatePayload } | { error: string; status: number } {
  const demo = req.body?.demo === true;
  const manual = req.body?.manual === true;
  const body = (req.body ?? {}) as Record<string, unknown>;

  if (demo) {
    if (!isDemoPartnerCreateAllowed()) {
      return { error: "Demo mode is only available in development", status: 403 };
    }
    return { payload: applyPartnerOverrides(getDemoPartnerCreatePayload(), body) };
  }

  if (manual) {
    const parsed = parseManualPayload(body);
    if ("error" in parsed) {
      return parsed;
    }
    return { payload: applyPartnerOverrides(parsed.payload, body) };
  }

  const encoded = typeof body.payload === "string" ? body.payload.trim() : "";
  const sig = typeof body.sig === "string" ? body.sig.trim() : "";

  const verified = verifySignedPartnerPayload(encoded, sig);
  if ("error" in verified) {
    return { error: verified.error, status: verified.status };
  }
  return { payload: applyPartnerOverrides(verified.payload, body) };
}

export async function createPartnerProject(req: Request, res: Response): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const resolved = resolvePayload(req);
  if ("error" in resolved) {
    res.status(resolved.status).json({ error: resolved.error });
    return;
  }

  const workspaceId =
    typeof req.body?.workspaceId === "string" ? req.body.workspaceId.trim() : undefined;
  const deployment = parseDeploymentOverride((req.body ?? {}) as Record<string, unknown>);
  const sectionCustomization = parseSectionCustomizationOverride(
    (req.body ?? {}) as Record<string, unknown>
  );

  try {
    const project = await createProjectFromPartnerCreatePayload(
      userId,
      resolved.payload,
      workspaceId,
      deployment,
      sectionCustomization
    );
    res.status(201).json({
      id: project.id,
      title: project.title,
      editorUrl: `/projects/${project.id}?partner=create`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create project";
    res.status(500).json({ error: msg });
  }
}

export async function verifyPartnerCreatePayloadHandler(
  req: Request,
  res: Response
): Promise<void> {
  const demo = req.query.demo === "1" || req.query.demo === "true";
  if (demo) {
    if (!isDemoPartnerCreateAllowed()) {
      res.status(403).json({ error: "Demo mode is only available in development" });
      return;
    }
    res.status(200).json({ payload: getDemoPartnerCreatePayload() });
    return;
  }

  const encoded = typeof req.query.payload === "string" ? req.query.payload.trim() : "";
  const sig = typeof req.query.sig === "string" ? req.query.sig.trim() : "";
  const verified = verifySignedPartnerPayload(encoded, sig);
  if ("error" in verified) {
    res.status(verified.status).json({ error: verified.error });
    return;
  }
  res.status(200).json({ payload: verified.payload, payloadEncoded: encoded, sig });
}

export async function checkPartnerPublishUrlHandler(
  req: Request,
  res: Response
): Promise<void> {
  const subdomain = typeof req.query.subdomain === "string" ? req.query.subdomain.trim() : "";
  const domain = typeof req.query.domain === "string" ? req.query.domain.trim() : "";

  if (!subdomain || !domain) {
    res.status(400).json({ error: "subdomain and domain are required" });
    return;
  }

  try {
    const result = await checkPublishUrlAvailability(subdomain, domain);
    res.status(200).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to check availability";
    res.status(500).json({ error: msg });
  }
}

export async function previewPartnerTokenHandler(
  req: Request,
  res: Response
): Promise<void> {
  const address = typeof req.query.address === "string" ? req.query.address.trim() : "";
  const chain = typeof req.query.chain === "string" ? req.query.chain.trim() : "";

  if (!address || !chain) {
    res.status(400).json({ error: "address and chain are required" });
    return;
  }

  try {
    const preview = await previewPartnerToken(address, chain);
    res.status(200).json(preview);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch token details";
    const status = msg.includes("not found") || msg.includes("check the address") ? 404 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function generatePartnerCreateHeroTextHandler(
  req: Request,
  res: Response
): Promise<void> {
  const description =
    typeof req.body?.description === "string" ? req.body.description.trim() : "";

  if (!description) {
    res.status(400).json({ error: "description is required" });
    return;
  }

  try {
    const heroText = await generatePartnerCreateHeroText(description);
    if (!heroText) {
      res.status(503).json({ error: "Hero text generation is unavailable" });
      return;
    }
    res.status(200).json({ heroText });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to generate hero text";
    res.status(500).json({ error: msg });
  }
}
