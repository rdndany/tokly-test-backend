import mongoose from "mongoose";
import OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";
import config from "../config";
import ProjectModel from "../models/Project";
import StarredProjectModel from "../models/StarredProject";
import WorkspaceMemberModel from "../models/WorkspaceMember";
import ProjectChatMessageModel from "../models/ProjectChatMessage";
import ProjectFileModel from "../models/ProjectFile";
import { extractLexicalText, plainTextToLexicalJSON } from "../utils/lexicalHelpers";
import { getDexUrlForBlockchain, extractTokenAddressFromDexUrl } from "../utils/dexUtils";
import { fetchTokenDetails } from "./mobulaService";
import { buildTokenBrief } from "../utils/tokenBrief";
import type {
  ListingPlatformEntry,
  SocialLinkItem,
  SocialLinkPlatform,
  TokenFeatures,
} from "../types/tokenDetails";
import {
  ensureUserCanAccessWorkspace,
  getMemberRole,
} from "./workspaceService";
import { emitProjectUpdated, emitProjectsUpdated } from "../socket/events";
import { logProjectChange } from "./projectHistoryService";

export async function ensureUserCanEditProject(
  userId: string,
  project: { userId: string; workspaceId?: { toString(): string } }
): Promise<void> {
  const workspaceId = project.workspaceId?.toString();
  if (workspaceId) {
    const canAccess = await ensureUserCanAccessWorkspace(userId, workspaceId);
    if (!canAccess) throw new Error("Forbidden");
    const role = await getMemberRole(userId, workspaceId);
    if (role === "viewer") throw new Error("Forbidden");
  } else if (project.userId !== userId) {
    throw new Error("Forbidden");
  }
}

function isValidHttpUrl(s: string): boolean {
  const t = s?.trim();
  if (!t) return false;
  if (!/^https?:\/\//i.test(t)) return false;
  try {
    new URL(t);
    return true;
  } catch {
    return false;
  }
}

const AUDIT_PROVIDER_IDS = [
  "certik", "hacken", "solidproof", "coinsult", "cyberscope",
  "assuredefi", "freshcoins", "cfgninja", "spywolf", "interfi", "other",
] as const;
const KYC_PROVIDER_IDS = [
  "certik", "pinksale", "hacken", "cyberscope", "assuredefi",
  "freshcoins", "coinsult", "solidproof", "spywolf", "interfi", "other",
] as const;

const LISTING_PLATFORM_IDS = ["freshcoins", "coinsniper", "cryptach"] as const;
import { getTokenSecurity } from "./goplusService";

const openai = config.openai.apiKey
  ? new OpenAI({ apiKey: config.openai.apiKey })
  : null;

async function generateHeroText(descriptionPlainText: string): Promise<string> {
  if (!openai || !descriptionPlainText.trim()) return "";
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You write short, punchy one-liner taglines for crypto/Web3 project hero sections. Maximum 150 characters. No quotes. Output only the tagline, nothing else.",
        },
        {
          role: "user",
          content: `Based on this project description, write a catchy one-liner for the hero section:\n\n${descriptionPlainText.trim().slice(0, 2000)}`,
        },
      ],
      max_tokens: 60,
    });
    const text = completion.choices[0]?.message?.content?.trim();
    return text && text.length <= 200 ? text : "";
  } catch {
    return "";
  }
}

async function generateSettingsUpdateComment(
  context: string,
  prompt: string
): Promise<string> {
  if (!openai) return context;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an AI assistant for a crypto landing page builder. When the user updates project settings, write a brief, friendly 1–2 sentence comment acknowledging the update. Be concise and encouraging. No bullet lists.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 120,
    });
    const text = completion.choices[0]?.message?.content?.trim();
    return text && text.length <= 500 ? text : context;
  } catch {
    return context;
  }
}

async function generateDescriptionUpdateComment(
  descriptionPlain: string,
  heroTextPlain: string
): Promise<string> {
  if (!openai) return "I've updated your project description and hero text.";
  const hasDesc = descriptionPlain.trim().length > 0;
  const hasHero = heroTextPlain.trim().length > 0;
  if (!hasDesc && !hasHero) {
    return "I've cleared the project description and hero text.";
  }
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an AI assistant for a crypto landing page builder. When the user updates their project description or hero text, write a brief, friendly 1–2 sentence comment acknowledging the update. Mention what works well or stands out. Be concise and encouraging. No bullet lists.",
        },
        {
          role: "user",
          content: `The user just updated their project:
${hasDesc ? `Description: ${descriptionPlain.trim().slice(0, 1500)}` : ""}
${hasDesc && hasHero ? "\n" : ""}
${hasHero ? `Hero text: ${heroTextPlain.trim().slice(0, 200)}` : ""}

Write a short comment about it.`,
        },
      ],
      max_tokens: 120,
    });
    const text = completion.choices[0]?.message?.content?.trim();
    return text && text.length <= 500 ? text : "I've updated your project description and hero text.";
  } catch {
    return "I've updated your project description and hero text.";
  }
}

/** Generate hero text from description. Returns Lexical JSON. */
export async function generateHeroTextForProject(
  userId: string,
  projectId: string,
  options?: { description?: string }
): Promise<{ heroText: string } | null> {
  const project = await getProjectById(projectId);
  if (!project) return null;
  if (project.userId !== userId) return null;
  const descRaw =
    options?.description?.trim() ?? project.description ?? "";
  const descPlain = extractLexicalText(descRaw);
  if (!descPlain.trim()) return null;
  const generated = await generateHeroText(descPlain);
  if (!generated) return null;
  return { heroText: plainTextToLexicalJSON(generated) };
}

export type CreateProjectInput = {
  userId: string;
  workspaceId: string;
  prompt: string;
  title?: string;
  folderId?: string | null;
};

export async function createProject(input: CreateProjectInput) {
  const { userId, workspaceId, prompt, title, folderId } = input;
  if (!workspaceId) throw new Error("Workspace ID is required");
  const uid = uuidv4();
  const shortId = uid.split("-").map((s) => s[0]).join("");
  const projectTitle = title?.trim() || `Project ${shortId}`;
  const projectData: Record<string, unknown> = {
    userId,
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    prompt: prompt.trim(),
    title: projectTitle,
  };
  if (folderId) {
    projectData.folderId = new mongoose.Types.ObjectId(folderId);
  }
  const project = await ProjectModel.create(projectData);
  const projectId = project._id.toString();
  logProjectChange(projectId, userId, "Created project", "general");
  emitProjectsUpdated(workspaceId);

  return {
    id: projectId,
    userId: project.userId,
    workspaceId: project.workspaceId?.toString(),
    prompt: project.prompt,
    title: project.title,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

export async function getProjectById(projectId: string) {
  const project = await ProjectModel.findById(projectId).lean();
  if (!project) return null;
  const tokenDetails = project.tokenDetails;
  const socialLinks = migrateSocialLinks(project.socialLinks);
  return {
    id: project._id.toString(),
    userId: project.userId,
    workspaceId: project.workspaceId,
    folderId: project.folderId?.toString() ?? null,
    prompt: project.prompt,
    title: project.title,
    description: project.description,
    category: project.category,
    heroText: project.heroText,
    socialLinks,
    auditProvider: project.auditProvider,
    auditLink: project.auditLink,
    kycProvider: project.kycProvider,
    kycLink: project.kycLink,
    listingPlatforms: project.listingPlatforms,
    installationSteps: project.installationSteps,
    tokenDetails,
    templateId: project.templateId,
    fontFamily: project.fontFamily,
    colorSchemaId: project.colorSchemaId,
      sectionVisibility: project.sectionVisibility,
      sectionOrder: project.sectionOrder,
      sectionCustomization: (project as { sectionCustomization?: Record<string, { layout?: { type?: string } }> }).sectionCustomization,
      hideToklyBadge: project.hideToklyBadge,
    projectVisibility: project.projectVisibility ?? "workshop",
    favicon: project.favicon,
    seoTitle: project.seoTitle,
    seoDescription: project.seoDescription,
    ogImage: project.ogImage,
    subdomain: project.subdomain,
    domain: project.domain,
    published: project.published,
    totalSupply: (project as { totalSupply?: string }).totalSupply,
    allocations: (project as { allocations?: Array<{ id: string; name: string; percentage: number; color: string }> }).allocations,
    phases: (project as { phases?: Array<{ id: string; name: string; milestones: Array<{ id: string; text: string; completed: boolean }> }> }).phases,
    faqItems: (project as { faqItems?: Array<{ id: string; question: string; answer: string }> }).faqItems,
    teamMembers: (project as { teamMembers?: Array<{ id: string; image?: string; name: string; role: string; socials: Array<{ type: string; url: string }> }> }).teamMembers,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

export async function getTokenPreview(
  userId: string,
  projectId: string,
  address: string,
  chain: string
): Promise<{ logo?: string; name?: string; symbol?: string } | null> {
  const project = await getProjectById(projectId);
  if (!project) return null;
  if (project.userId !== userId) return null;
  const fetched = await fetchTokenDetails(address.trim(), chain);
  if (!fetched) return null;
  return {
    logo: fetched.logo,
    name: fetched.name,
    symbol: fetched.symbol,
  };
}

export async function updateProjectTitle(
  userId: string,
  projectId: string,
  input: { title: string }
) {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanEditProject(userId, project);
  const rawTitle = input.title?.trim() || `Project ${projectId.slice(0, 8)}`;
  if (rawTitle.length > 100) {
    throw new Error("Project name must be 100 characters or less");
  }
  const title = rawTitle;
  await ProjectModel.updateOne(
    { _id: projectId },
    { $set: { title } }
  );
  const updated = await getProjectById(projectId);
  if (!updated) throw new Error("Project not found");
  logProjectChange(projectId, userId, "Changed project title", "general");
  emitProjectUpdated(projectId);
  return updated;
}

export async function updateProjectCategory(
  userId: string,
  projectId: string,
  input: { category: string }
) {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanEditProject(userId, project);
  const category = input.category?.trim() || undefined;
  await ProjectModel.updateOne(
    { _id: projectId },
    { $set: { category } }
  );
  const updated = await getProjectById(projectId);
  if (!updated) throw new Error("Project not found");
  logProjectChange(projectId, userId, "Changed project category", "general");
  emitProjectUpdated(projectId);
  return updated;
}

export async function updateProjectVisibility(
  userId: string,
  projectId: string,
  input: { projectVisibility: "public" | "workshop" }
) {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanEditProject(userId, project);
  const projectVisibility = input.projectVisibility === "public" ? "public" : "workshop";
  await ProjectModel.updateOne(
    { _id: projectId },
    { $set: { projectVisibility } }
  );
  const updated = await getProjectById(projectId);
  if (!updated) throw new Error("Project not found");
  logProjectChange(projectId, userId, "Changed project visibility", "general");
  emitProjectUpdated(projectId);
  return updated;
}

export async function updateProjectSeo(
  userId: string,
  projectId: string,
  input: {
    favicon?: string | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
    ogImage?: string | null;
  }
) {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanEditProject(userId, project);
  const toSet: Record<string, string> = {};
  const toUnset: Record<string, string> = {};
  if ("favicon" in input) {
    const v = input.favicon;
    if (v === null || v === "" || (typeof v === "string" && !v.trim())) {
      toUnset.favicon = "";
    } else if (typeof v === "string") {
      toSet.favicon = v.trim();
    }
  }
  if ("seoTitle" in input) {
    const v = input.seoTitle;
    if (v === null || v === "" || (typeof v === "string" && !v.trim())) {
      toUnset.seoTitle = "";
    } else if (typeof v === "string") {
      toSet.seoTitle = v.trim().slice(0, 60);
    }
  }
  if ("seoDescription" in input) {
    const v = input.seoDescription;
    if (v === null || v === "" || (typeof v === "string" && !v.trim())) {
      toUnset.seoDescription = "";
    } else if (typeof v === "string") {
      toSet.seoDescription = v.trim().slice(0, 160);
    }
  }
  if ("ogImage" in input) {
    const v = input.ogImage;
    if (v === null || v === "" || (typeof v === "string" && !v.trim())) {
      toUnset.ogImage = "";
    } else if (typeof v === "string") {
      toSet.ogImage = v.trim();
    }
  }
  const updateOp: Record<string, Record<string, string>> = {};
  if (Object.keys(toSet).length > 0) updateOp.$set = toSet;
  if (Object.keys(toUnset).length > 0) updateOp.$unset = toUnset;
  if (Object.keys(updateOp).length > 0) {
    await ProjectModel.updateOne({ _id: projectId }, updateOp);
  }
  const updated = await getProjectById(projectId);
  if (!updated) throw new Error("Project not found");
  logProjectChange(projectId, userId, "Updated SEO settings", "general");
  emitProjectUpdated(projectId);
  return updated;
}

/** Get published project by subdomain+domain. Returns null if not found or not published. Public – no auth. */
export async function getProjectByPublishUrl(
  subdomain: string,
  domain: string
): Promise<Awaited<ReturnType<typeof getProjectById>> | null> {
  const s = (subdomain || "").trim().toLowerCase();
  const d = (domain || "").trim().toLowerCase();
  if (!s || !d || s.length < 4 || !/^[a-z0-9-]+$/.test(s)) return null;
  const project = await ProjectModel.findOne({
    subdomain: s,
    domain: d,
    published: true,
  })
    .lean();
  if (!project) return null;
  const socialLinks = migrateSocialLinks(project.socialLinks);
  return {
    id: project._id.toString(),
    userId: project.userId,
    workspaceId: project.workspaceId,
    folderId: project.folderId?.toString() ?? null,
    prompt: project.prompt,
    title: project.title,
    description: project.description,
    category: project.category,
    heroText: project.heroText,
    socialLinks,
    auditProvider: project.auditProvider,
    auditLink: project.auditLink,
    kycProvider: project.kycProvider,
    kycLink: project.kycLink,
    listingPlatforms: project.listingPlatforms,
    installationSteps: project.installationSteps,
    tokenDetails: project.tokenDetails,
    templateId: project.templateId,
    fontFamily: project.fontFamily,
    colorSchemaId: project.colorSchemaId,
      sectionVisibility: project.sectionVisibility,
      sectionOrder: project.sectionOrder,
      sectionCustomization: (project as { sectionCustomization?: Record<string, { layout?: { type?: string } }> }).sectionCustomization,
      hideToklyBadge: project.hideToklyBadge,
    projectVisibility: project.projectVisibility ?? "workshop",
    favicon: project.favicon,
    seoTitle: project.seoTitle,
    seoDescription: project.seoDescription,
    ogImage: project.ogImage,
    subdomain: project.subdomain,
    domain: project.domain,
    published: project.published,
    totalSupply: (project as { totalSupply?: string }).totalSupply,
    allocations: (project as { allocations?: Array<{ id: string; name: string; percentage: number; color: string }> }).allocations,
    phases: (project as { phases?: Array<{ id: string; name: string; milestones: Array<{ id: string; text: string; completed: boolean }> }> }).phases,
    faqItems: (project as { faqItems?: Array<{ id: string; question: string; answer: string }> }).faqItems,
    teamMembers: (project as { teamMembers?: Array<{ id: string; image?: string; name: string; role: string; socials: Array<{ type: string; url: string }> }> }).teamMembers,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

/** Check if subdomain+domain is available (not taken by another project) */
export async function checkPublishUrlAvailability(
  subdomain: string,
  domain: string,
  excludeProjectId?: string
): Promise<{ available: boolean }> {
  const s = (subdomain || "").trim().toLowerCase();
  const d = (domain || "").trim().toLowerCase();
  if (!s || !d) {
    return { available: false };
  }
  if (s.length < 4 || !/^[a-z0-9-]+$/.test(s) || s.length > 50) {
    return { available: false };
  }
  const query: Record<string, unknown> = { subdomain: s, domain: d };
  if (excludeProjectId && mongoose.Types.ObjectId.isValid(excludeProjectId)) {
    query._id = { $ne: new mongoose.Types.ObjectId(excludeProjectId) };
  }
  const existing = await ProjectModel.findOne(query).select("_id").lean();
  return { available: !existing };
}

/** Update project publish address (subdomain+domain). Validates uniqueness. */
export async function updateProjectPublishAddress(
  userId: string,
  projectId: string,
  input: { subdomain: string; domain: string }
) {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanEditProject(userId, project);

  const subdomain = (input.subdomain || "").trim().toLowerCase();
  const domain = (input.domain || "").trim().toLowerCase();
  if (!subdomain || !domain) {
    throw new Error("Subdomain and domain are required");
  }
  if (subdomain.length < 4) {
    throw new Error("Subdomain must be at least 4 characters");
  }
  if (!/^[a-z0-9-]+$/.test(subdomain) || subdomain.length > 50) {
    throw new Error("Subdomain must be 4-50 lowercase letters, numbers, or hyphens");
  }

  const { available } = await checkPublishUrlAvailability(subdomain, domain, projectId);
  if (!available) {
    throw new Error("This URL is already taken by another project");
  }

  await ProjectModel.updateOne(
    { _id: projectId },
    { $set: { subdomain, domain, published: true } }
  );
  const updated = await getProjectById(projectId);
  if (!updated) throw new Error("Project not found");
  logProjectChange(projectId, userId, "Updated publish address", "general");
  emitProjectUpdated(projectId);
  return updated;
}

/** Capture screenshot of published project and update thumbnailUrl. Requires subdomain + domain. */
export async function captureProjectThumbnail(
  userId: string,
  projectId: string
): Promise<Awaited<ReturnType<typeof getProjectById>>> {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanEditProject(userId, project);

  const subdomain = (project.subdomain ?? "").trim().toLowerCase();
  const domain = (project.domain ?? "").trim().toLowerCase();
  if (!subdomain || !domain) {
    throw new Error("Project must be published (have subdomain and domain) to capture thumbnail");
  }

  const { captureAndUploadProjectThumbnail } = await import(
    "./screenshotService"
  );
  await captureAndUploadProjectThumbnail(projectId, subdomain, domain);
  emitProjectUpdated(projectId);

  const updated = await getProjectById(projectId);
  if (!updated) throw new Error("Project not found");
  return updated;
}

/** Unpublish project: set published to false and clear subdomain/domain. */
export async function unpublishProject(userId: string, projectId: string) {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanEditProject(userId, project);

  await ProjectModel.updateOne(
    { _id: projectId },
    {
      $set: { published: false },
      $unset: { subdomain: "", domain: "", thumbnailUrl: "" },
    }
  );
  const updated = await getProjectById(projectId);
  if (!updated) throw new Error("Project not found");
  logProjectChange(projectId, userId, "Unpublished project", "general");
  emitProjectUpdated(projectId);
  return updated;
}

export async function updateHideToklyBadge(
  userId: string,
  projectId: string,
  input: { hideToklyBadge: boolean }
) {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanEditProject(userId, project);
  const hideToklyBadge = input.hideToklyBadge === true;
  await ProjectModel.updateOne(
    { _id: projectId },
    { $set: { hideToklyBadge } }
  );
  const updated = await getProjectById(projectId);
  if (!updated) throw new Error("Project not found");
  logProjectChange(projectId, userId, "Updated hide Tokly badge", "general");
  emitProjectUpdated(projectId);
  return updated;
}

export async function transferProject(
  userId: string,
  projectId: string,
  input: { workspaceId: string }
) {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  if (project.userId !== userId) {
    throw new Error("Only the project owner can transfer the project");
  }
  const targetWorkspaceId = input.workspaceId?.trim();
  if (!targetWorkspaceId) {
    throw new Error("Target workspace is required");
  }
  const canAccess = await ensureUserCanAccessWorkspace(userId, targetWorkspaceId);
  if (!canAccess) {
    throw new Error("You do not have access to the target workspace");
  }
  const currentWsId =
    project.workspaceId != null
      ? String(project.workspaceId)
      : null;
  if (currentWsId === targetWorkspaceId) {
    throw new Error("Project is already in this workspace");
  }
  await ProjectModel.updateOne(
    { _id: projectId },
    { $set: { workspaceId: new mongoose.Types.ObjectId(targetWorkspaceId) } }
  );
  const updated = await getProjectById(projectId);
  if (!updated) throw new Error("Project not found");
  logProjectChange(projectId, userId, "Transferred project to another workspace", "general");
  emitProjectUpdated(projectId);
  return updated;
}

export async function updateProjectTokenDetails(
  userId: string,
  projectId: string,
  input: { address: string; chain: string; logo?: string; fromQuestionnaire?: boolean; fromGeneralSettings?: boolean }
) {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanEditProject(userId, project);

  // Fetch full token details from Mobula (throws on 404 / token not found)
  const fetched = await fetchTokenDetails(input.address, input.chain);
  if (!fetched) {
    throw new Error(
      "Failed to verify token. Please check the address and blockchain, then try again."
    );
  }
  const tokenDetails = fetched;
  tokenDetails.dexUrl = getDexUrlForBlockchain(input.chain, input.address);
  // Use logo override when user provided a different URL
  if (input.logo !== undefined) {
    tokenDetails.logo = input.logo || undefined;
  }
  // If token has price, it's launched: set launchType and clear launchPlatformUrl
  const hasPrice = (tokenDetails.price ?? 0) > 0;
  if (hasPrice) {
    tokenDetails.launchType = "launched";
    delete tokenDetails.launchPlatformUrl;
  }

  // Fetch GoPlus token security and merge into tokenFeatures
  const goPlus = await getTokenSecurity(input.chain, input.address);
  if (goPlus) {
    const existing = tokenDetails.tokenFeatures ?? {};
    tokenDetails.tokenFeatures = { ...existing };
    if (goPlus.contractRenounced !== undefined) {
      tokenDetails.tokenFeatures.contractRenounced = goPlus.contractRenounced;
    }
    if (goPlus.mintAuthority?.revoked !== undefined) {
      tokenDetails.tokenFeatures.mintAuthorityRevoked = goPlus.mintAuthority.revoked;
    }
    if (goPlus.freezeAuthority?.revoked !== undefined) {
      tokenDetails.tokenFeatures.freezeAuthorityRevoked = goPlus.freezeAuthority.revoked;
    }
    if (goPlus.updateAuthority?.revoked !== undefined) {
      tokenDetails.tokenFeatures.updateAuthorityRevoked = goPlus.updateAuthority.revoked;
    }
  }

  let newTitle: string | undefined;
  if (tokenDetails.name || tokenDetails.symbol) {
    newTitle =
      tokenDetails.name && tokenDetails.symbol
        ? `${tokenDetails.name} - ${tokenDetails.symbol}`
        : (tokenDetails.name || tokenDetails.symbol || undefined);
  }

  const installationSteps = {
    ...project.installationSteps,
    tokenDetailsStepCompleted: true,
  };

  const updated = await ProjectModel.findByIdAndUpdate(
    projectId,
    { $set: { tokenDetails, installationSteps, ...(newTitle && { title: newTitle }) } },
    { new: true }
  ).lean();
  if (!updated) throw new Error("Project not found");
  logProjectChange(projectId, userId, "Updated token details", "general");
  emitProjectUpdated(projectId);

  const summary = buildTokenSummary(updated.tokenDetails);
  const tokenSavedContent = buildTokenBrief(updated.tokenDetails, summary);

  const projectIdObj = new mongoose.Types.ObjectId(projectId);

  // Add chat messages when user sets address/chain from General Settings
  if (input.fromGeneralSettings) {
    const assistantContent = await generateSettingsUpdateComment(
      "I've added and validated your token's contract address and blockchain.",
      `The user just added and validated their token's contract address and blockchain in Settings:
Address: ${input.address.trim()}
Blockchain: ${input.chain}
Token: ${updated.tokenDetails?.name ?? ""} (${updated.tokenDetails?.symbol ?? ""})

Write a brief, friendly 1-2 sentence comment acknowledging the update.`
    );
    await ProjectChatMessageModel.create({
      projectId: projectIdObj,
      role: "user",
      content: "Added contract address and blockchain in Settings.",
    });
    await ProjectChatMessageModel.create({
      projectId: projectIdObj,
      role: "assistant",
      content: assistantContent,
    });
  } else if (!input.fromQuestionnaire) {
    // Add user message and assistant response when user pastes in chat
    const lastMessage = await ProjectChatMessageModel.findOne(
      { projectId: projectIdObj },
      {},
      { sort: { createdAt: -1 } }
    ).lean();
    const lastIsUser = lastMessage?.role === "user";
    if (lastIsUser) {
      const userContent = `Token address: ${input.address.trim()}\nBlockchain: ${input.chain}`;
      await ProjectChatMessageModel.create({
        projectId: projectIdObj,
        role: "user",
        content: userContent,
      });
      await ProjectChatMessageModel.create({
        projectId: projectIdObj,
        role: "assistant",
        content: tokenSavedContent,
      });
    }
  }

  return {
    id: updated._id.toString(),
    userId: updated.userId,
    prompt: updated.prompt,
    title: updated.title,
    description: updated.description,
    installationSteps: updated.installationSteps,
    tokenDetails: updated.tokenDetails,
    tokenSummary: summary,
    tokenBrief: tokenSavedContent,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

export async function updateProjectLaunchDetails(
  userId: string,
  projectId: string,
  input: { launchType?: string; launchPlatformUrl?: string }
) {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanEditProject(userId, project);
  const hasAddressAndChain =
    project.tokenDetails?.address && project.tokenDetails?.chain;
  const hasNameAndSymbol =
    project.tokenDetails?.name && project.tokenDetails?.symbol;
  if (!hasAddressAndChain && !hasNameAndSymbol) {
    throw new Error(
      "Launch details can only be set for projects with token address+chain or name+symbol"
    );
  }

  const newLaunchType =
    input.launchType != null ? (input.launchType.trim() || undefined) : undefined;
  const shouldClearLaunchUrl =
    newLaunchType === "launched" || newLaunchType === "not_launched";

  const tokenDetails: Record<string, unknown> = {
    ...project.tokenDetails,
    ...(newLaunchType != null && { launchType: newLaunchType }),
  };

  if (shouldClearLaunchUrl) {
    delete tokenDetails.launchPlatformUrl;
  } else if (input.launchPlatformUrl != null) {
    tokenDetails.launchPlatformUrl =
      input.launchPlatformUrl.trim() || undefined;
  }

  const updated = await ProjectModel.findByIdAndUpdate(
    projectId,
    { $set: { tokenDetails } },
    { new: true }
  ).lean();
  if (!updated) throw new Error("Project not found");
  logProjectChange(projectId, userId, "Updated launch status", "general");
  emitProjectUpdated(projectId);

  // Add AI comment to chat when launch status was updated
  const projectIdObj = new mongoose.Types.ObjectId(projectId);
  const lt = updated.tokenDetails?.launchType;
  const lp = updated.tokenDetails?.launchPlatformUrl;
  const launchLabel =
    lt === "launched"
      ? "Token Launched"
      : lt === "presale"
        ? "Presale"
        : lt === "fair_launch"
          ? "Fair Launch"
          : "Not launched";
  const assistantContent = await generateSettingsUpdateComment(
    "I've updated your token launch status in Settings.",
    `The user just updated the token launch status in Settings:
Status: ${launchLabel}${lp ? `\nLaunch Platform URL: ${lp}` : ""}

Write a short comment about it.`
  );
  await ProjectChatMessageModel.create({
    projectId: projectIdObj,
    role: "user",
    content: "Updated token launch status in Settings.",
  });
  await ProjectChatMessageModel.create({
    projectId: projectIdObj,
    role: "assistant",
    content: assistantContent,
  });

  return {
    id: updated._id.toString(),
    userId: updated.userId,
    prompt: updated.prompt,
    title: updated.title,
    description: updated.description,
    installationSteps: updated.installationSteps,
    tokenDetails: updated.tokenDetails,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

const LEGACY_SOCIAL_KEYS: { key: string; platform: SocialLinkPlatform }[] = [
  { key: "x", platform: "x" },
  { key: "telegram", platform: "telegram" },
  { key: "discord", platform: "discord" },
  { key: "github", platform: "github" },
  { key: "youtube", platform: "youtube" },
  { key: "whitepaper", platform: "whitepaper" },
];

function migrateSocialLinks(
  raw: unknown
): SocialLinkItem[] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const arr = raw as unknown[];
  if (Array.isArray(arr)) {
    return arr.filter((x): x is SocialLinkItem => {
      if (!x || typeof x !== "object") return false;
      const o = x as Record<string, unknown>;
      return "platform" in o && "url" in o && typeof o.url === "string";
    });
  }
  const obj = raw as Record<string, string>;
  const links: SocialLinkItem[] = [];
  for (const { key, platform } of LEGACY_SOCIAL_KEYS) {
    const url = obj[key]?.trim();
    if (url) links.push({ platform, url });
  }
  return links.length ? links : undefined;
}

const EVM_CHAINS = ["bsc", "ethereum", "eth", "base", "monad"];

function isEvmChain(chain: string | undefined): boolean {
  if (!chain) return false;
  return EVM_CHAINS.includes(chain.toLowerCase());
}

export async function updateProjectTokenFeatures(
  userId: string,
  projectId: string,
  input: Partial<TokenFeatures>
) {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanEditProject(userId, project);
  const hasAddressAndChain =
    project.tokenDetails?.address && project.tokenDetails?.chain;
  const hasNameAndSymbol =
    project.tokenDetails?.name && project.tokenDetails?.symbol;
  if (!hasAddressAndChain && !hasNameAndSymbol) {
    throw new Error(
      "Token features can only be set for projects with address+chain or name+symbol"
    );
  }

  const existing = project.tokenDetails?.tokenFeatures ?? {};
  const tokenFeatures: TokenFeatures = { ...existing };

  if (input.liquidityLocked !== undefined) tokenFeatures.liquidityLocked = input.liquidityLocked;
  if (input.teamVesting !== undefined) tokenFeatures.teamVesting = input.teamVesting;
  if (input.teamVestingDuration !== undefined) tokenFeatures.teamVestingDuration = input.teamVestingDuration;
  if (input.transactionTaxRates !== undefined) {
    tokenFeatures.transactionTaxRates = input.transactionTaxRates;
    if (!input.transactionTaxRates) {
      delete tokenFeatures.sellTax;
      delete tokenFeatures.buyTax;
      delete tokenFeatures.transferTax;
    }
  }
  if (input.sellTax !== undefined) tokenFeatures.sellTax = input.sellTax;
  if (input.buyTax !== undefined) tokenFeatures.buyTax = input.buyTax;
  if (input.transferTax !== undefined) tokenFeatures.transferTax = input.transferTax;
  if (input.teamVesting !== undefined && !input.teamVesting) {
    delete tokenFeatures.teamVestingDuration;
  }

  const chain = project.tokenDetails?.chain;
  if (isEvmChain(chain)) {
    if (input.contractRenounced !== undefined) tokenFeatures.contractRenounced = input.contractRenounced;
    if (input.burnMechanism !== undefined) tokenFeatures.burnMechanism = input.burnMechanism;
    if (input.stakingRewards !== undefined) tokenFeatures.stakingRewards = input.stakingRewards;
  } else if (chain?.toLowerCase() === "solana") {
    if (input.mintAuthorityRevoked !== undefined) tokenFeatures.mintAuthorityRevoked = input.mintAuthorityRevoked;
    if (input.freezeAuthorityRevoked !== undefined) tokenFeatures.freezeAuthorityRevoked = input.freezeAuthorityRevoked;
    if (input.updateAuthorityRevoked !== undefined) tokenFeatures.updateAuthorityRevoked = input.updateAuthorityRevoked;
  }

  const tokenDetails = {
    ...project.tokenDetails,
    tokenFeatures,
  };

  const updated = await ProjectModel.findByIdAndUpdate(
    projectId,
    { $set: { tokenDetails } },
    { new: true }
  ).lean();
  if (!updated) throw new Error("Project not found");
  logProjectChange(projectId, userId, "Updated token features", "general");
  emitProjectUpdated(projectId);

  return {
    id: updated._id.toString(),
    userId: updated.userId,
    prompt: updated.prompt,
    title: updated.title,
    description: updated.description,
    installationSteps: updated.installationSteps,
    tokenDetails: updated.tokenDetails,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

export async function updateProjectTokenLogo(
  userId: string,
  projectId: string,
  input: { logo?: string }
) {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanEditProject(userId, project);
  const hasAddressAndChain =
    project.tokenDetails?.address && project.tokenDetails?.chain;
  const hasNameAndSymbol =
    project.tokenDetails?.name && project.tokenDetails?.symbol;
  if (!hasAddressAndChain && !hasNameAndSymbol) {
    throw new Error(
      "Token logo can only be set for projects with address+chain or name+symbol"
    );
  }

  const tokenDetails = {
    ...project.tokenDetails,
    logo: input.logo || undefined,
  };
  const installationSteps = {
    ...project.installationSteps,
    logoStepCompleted: true,
  };

  const updated = await ProjectModel.findByIdAndUpdate(
    projectId,
    { $set: { tokenDetails, installationSteps } },
    { new: true }
  ).lean();
  if (!updated) throw new Error("Project not found");
  logProjectChange(projectId, userId, "Updated token logo", "general");
  emitProjectUpdated(projectId);

  return {
    id: updated._id.toString(),
    userId: updated.userId,
    prompt: updated.prompt,
    title: updated.title,
    description: updated.description,
    installationSteps: updated.installationSteps,
    tokenDetails: updated.tokenDetails,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

export async function updateProjectDexUrl(
  userId: string,
  projectId: string,
  input: { dexUrl?: string }
) {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanEditProject(userId, project);
  const hasAddressAndChain =
    project.tokenDetails?.address && project.tokenDetails?.chain;
  const hasNameAndSymbol =
    project.tokenDetails?.name && project.tokenDetails?.symbol;
  if (!hasAddressAndChain && !hasNameAndSymbol) {
    throw new Error(
      "DEX URL can only be set for projects with address+chain or name+symbol"
    );
  }

  const shouldClearDexUrl =
    input.dexUrl == null ||
    (typeof input.dexUrl === "string" && input.dexUrl.trim() === "");

  const tokenDetails = { ...(project.tokenDetails || {}) } as Record<string, unknown>;
  if (shouldClearDexUrl) {
    delete tokenDetails.dexUrl;
  } else {
    tokenDetails.dexUrl = input.dexUrl!.trim();
  }

  const updated = await ProjectModel.findByIdAndUpdate(
    projectId,
    { $set: { tokenDetails } },
    { new: true }
  ).lean();
  if (!updated) throw new Error("Project not found");
  logProjectChange(projectId, userId, "Updated DEX link", "general");
  emitProjectUpdated(projectId);

  // Add AI comment to chat when DEX URL was updated
  const projectIdObj = new mongoose.Types.ObjectId(projectId);
  const chain = updated.tokenDetails?.chain?.toLowerCase() ?? "";
  const dexUrl = updated.tokenDetails?.dexUrl?.trim() || "";
  const projectAddress = updated.tokenDetails?.address?.trim().toLowerCase() ?? "";
  const urlAddress = dexUrl ? extractTokenAddressFromDexUrl(dexUrl)?.toLowerCase() : null;
  const addressMismatch =
    projectAddress &&
    urlAddress &&
    projectAddress !== urlAddress;

  const dexChainMapping = `
Chain-to-DEX mapping (correct DEXes per chain):
- Solana: Raydium (raydium.io), Pump.fun (pump.fun), Jupiter
- BSC: PancakeSwap (pancakeswap.finance)
- Ethereum, Base, Polygon, Monad: Uniswap (app.uniswap.org)
- Tron: SunSwap (sunswap.com)`;

  const addressMismatchNote = addressMismatch
    ? `
⚠️ IMPORTANT: The URL contains token address "${urlAddress}" but this project's token address is "${projectAddress}". They do NOT match. Add a clear, polite warning that the DEX URL may point to a different token.`
    : "";

  const assistantContent = await generateSettingsUpdateComment(
    "I've updated your DEX URL in Settings.",
    `The user just updated the DEX URL in Settings.
Token chain: ${chain || "(unknown)"}
Project token address: ${projectAddress || "(none)"}
New DEX URL: ${dexUrl || "(cleared)"}
${dexChainMapping}${addressMismatchNote}

Write a brief, friendly 1-2 sentence comment. If the URL is cleared, that's fine. If the URL looks invalid (wrong format, not a swap/trade link) OR if the DEX in the URL does NOT support the token's chain, add a clear, polite warning. If there's an address mismatch (noted above), you MUST warn the user. Otherwise just acknowledge the update.`
  );
  await ProjectChatMessageModel.create({
    projectId: projectIdObj,
    role: "user",
    content: "Updated DEX URL in Settings.",
  });
  await ProjectChatMessageModel.create({
    projectId: projectIdObj,
    role: "assistant",
    content: assistantContent,
  });

  return {
    id: updated._id.toString(),
    userId: updated.userId,
    prompt: updated.prompt,
    title: updated.title,
    description: updated.description,
    installationSteps: updated.installationSteps,
    tokenDetails: updated.tokenDetails,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

const VALID_PLATFORMS: SocialLinkPlatform[] = [
  "x",
  "telegram",
  "discord",
  "github",
  "youtube",
  "whitepaper",
  "external",
];

export async function updateProjectSocialLinks(
  userId: string,
  projectId: string,
  input: { links?: SocialLinkItem[] }
) {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanEditProject(userId, project);

  const raw = Array.isArray(input.links) ? input.links : [];
  const socialLinks: SocialLinkItem[] = raw
    .filter(
      (x): x is SocialLinkItem =>
        x && typeof x === "object" && "platform" in x && "url" in x
    )
    .map((x) => ({
      platform: VALID_PLATFORMS.includes(x.platform as SocialLinkPlatform)
        ? (x.platform as SocialLinkPlatform)
        : "external",
      url: typeof x.url === "string" ? x.url.trim() : "",
    }))
    .filter((x) => x.url.length > 0);

  const installationSteps = {
    ...project.installationSteps,
    socialLinksStepCompleted: true,
  };

  const hasSocialLinks = socialLinks.length > 0;
  const updateOp: Record<string, unknown> = {
    $set: { installationSteps },
  };
  if (hasSocialLinks) {
    (updateOp.$set as Record<string, unknown>).socialLinks = socialLinks;
  } else {
    updateOp.$unset = { socialLinks: 1 };
  }

  const updated = await ProjectModel.findByIdAndUpdate(
    projectId,
    updateOp,
    { new: true }
  ).lean();
  if (!updated) throw new Error("Project not found");
  logProjectChange(projectId, userId, "Updated social links", "links");
  emitProjectUpdated(projectId);

  return {
    id: updated._id.toString(),
    userId: updated.userId,
    prompt: updated.prompt,
    title: updated.title,
    description: updated.description,
    heroText: updated.heroText,
    socialLinks: updated.socialLinks,
    installationSteps: updated.installationSteps,
    tokenDetails: updated.tokenDetails,
    templateId: updated.templateId,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

const VALID_TEMPLATE_IDS = ["aurora", "minimal", "cobalt"] as const;

const VALID_AURORA_COLOR_SCHEMA_IDS = [
  "default",
  "sunset",
  "aurora-northern-lights",
  "aurora-cosmic-blue",
  "aurora-mystic-purple",
  "aurora-sunset-glow",
  "aurora-ocean-depths",
  "aurora-galaxy-night",
  "aurora-rose-gold",
  "aurora-forest-magic",
  "aurora-electric-storm",
  "aurora-crystal-clear",
  "aurora-midnight-dreams",
  "aurora-fire-ice",
  "aurora-deep-forest",
  "aurora-midnight-purple",
  "aurora-dark-emerald",
  "aurora-shadow-blue",
  "aurora-void-black",
  "aurora-obsidian-gray",
] as const;

const VALID_FONT_IDS = [
  "poppins", "rubik", "unbounded", "roboto", "montserrat", "quicksand",
  "kanit", "pixelify-sans", "bangers", "barriecito", "chewy", "itim",
  "caveat", "sigmar-one", "slackey", "burger-free", "neusharp",
  "sour-gummy", "titan-one",
] as const;

export async function updateProjectTemplate(
  userId: string,
  projectId: string,
  input: { templateId: string; fontFamily?: string; colorSchemaId?: string }
) {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanEditProject(userId, project);

  const templateId = input.templateId?.trim();
  if (!templateId || !VALID_TEMPLATE_IDS.includes(templateId as (typeof VALID_TEMPLATE_IDS)[number])) {
    throw new Error(`Invalid template. Choose one of: ${VALID_TEMPLATE_IDS.join(", ")}.`);
  }

  const setFields: Record<string, unknown> = {
    templateId,
    installationSteps: {
      ...project.installationSteps,
      templateStepCompleted: true,
    },
  };
  const unsetFields: Record<string, number> = {};
  if (input.fontFamily != null) {
    const fontId = input.fontFamily.trim();
    if (fontId && VALID_FONT_IDS.includes(fontId as (typeof VALID_FONT_IDS)[number])) {
      setFields.fontFamily = fontId;
    } else {
      unsetFields.fontFamily = 1;
    }
  }
  if (input.colorSchemaId != null) {
    const schemaId = input.colorSchemaId.trim();
    if (schemaId && VALID_AURORA_COLOR_SCHEMA_IDS.includes(schemaId as (typeof VALID_AURORA_COLOR_SCHEMA_IDS)[number])) {
      setFields.colorSchemaId = schemaId;
    } else {
      unsetFields.colorSchemaId = 1;
    }
  }

  const updateOp: Record<string, unknown> = { $set: setFields };
  if (Object.keys(unsetFields).length) updateOp.$unset = unsetFields;

  const updated = await ProjectModel.findByIdAndUpdate(
    projectId,
    updateOp,
    { new: true }
  ).lean();
  if (!updated) throw new Error("Project not found");
  logProjectChange(projectId, userId, "Updated template", "general");
  emitProjectUpdated(projectId);

  return {
    id: updated._id.toString(),
    userId: updated.userId,
    prompt: updated.prompt,
    title: updated.title,
    description: updated.description,
    heroText: updated.heroText,
    socialLinks: updated.socialLinks,
    auditProvider: updated.auditProvider,
    auditLink: updated.auditLink,
    kycProvider: updated.kycProvider,
    kycLink: updated.kycLink,
    listingPlatforms: updated.listingPlatforms,
    installationSteps: updated.installationSteps,
    tokenDetails: updated.tokenDetails,
    templateId: updated.templateId,
    fontFamily: updated.fontFamily,
    colorSchemaId: updated.colorSchemaId,
    sectionVisibility: updated.sectionVisibility,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

const VALID_SECTION_IDS = ["hero", "about", "tokenomics", "roadmap", "faq", "team", "live-chart", "how-to-buy", "join-community"] as const;

export async function updateProjectSectionVisibility(
  userId: string,
  projectId: string,
  input: {
    sectionVisibility: Record<string, boolean>;
    sectionOrder?: Record<string, number>;
  }
) {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanEditProject(userId, project);

  const raw = input.sectionVisibility;
  if (!raw || typeof raw !== "object") {
    throw new Error("sectionVisibility must be an object");
  }

  const sectionVisibility: Record<string, boolean> = {};
  for (const id of VALID_SECTION_IDS) {
    if (id === "hero") {
      sectionVisibility[id] = true;
    } else {
      sectionVisibility[id] = raw[id] === true;
    }
  }

  const updateFields: Record<string, unknown> = { sectionVisibility };
  if (input.sectionOrder != null && typeof input.sectionOrder === "object") {
    const sectionOrder: Record<string, number> = {};
    for (const id of VALID_SECTION_IDS) {
      const val = input.sectionOrder[id];
      if (typeof val === "number" && Number.isFinite(val)) {
        sectionOrder[id] = val;
      }
    }
    if (Object.keys(sectionOrder).length > 0) {
      updateFields.sectionOrder = sectionOrder;
    }
  }

  await ProjectModel.updateOne(
    { _id: projectId },
    { $set: updateFields }
  );
  const updated = await getProjectById(projectId);
  if (!updated) throw new Error("Project not found");
  logProjectChange(projectId, userId, "Updated section visibility", "sections");
  emitProjectUpdated(projectId);
  return updated;
}

export async function updateProjectSectionLayout(
  userId: string,
  projectId: string,
  input: { sectionId: string; layoutType: string }
) {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanEditProject(userId, project);

  const { sectionId, layoutType } = input;
  if (!sectionId || typeof sectionId !== "string") {
    throw new Error("sectionId is required");
  }
  if (!VALID_SECTION_IDS.includes(sectionId as (typeof VALID_SECTION_IDS)[number])) {
    throw new Error(`Invalid sectionId: ${sectionId}`);
  }
  if (!layoutType || typeof layoutType !== "string") {
    throw new Error("layoutType is required");
  }

  const existing = (project as { sectionCustomization?: Record<string, { layout?: { type?: string } }> }).sectionCustomization ?? {};
  const sectionCustomization = { ...existing };
  sectionCustomization[sectionId] = {
    ...sectionCustomization[sectionId],
    layout: { type: layoutType },
  };

  await ProjectModel.updateOne(
    { _id: projectId },
    { $set: { sectionCustomization } }
  );
  const updated = await getProjectById(projectId);
  if (!updated) throw new Error("Project not found");
  logProjectChange(projectId, userId, "Updated section layout", "sections");
  emitProjectUpdated(projectId);
  return updated;
}

export interface TokenAllocationInput {
  id: string;
  name: string;
  percentage: number;
  color: string;
}

export async function updateProjectTokenomics(
  userId: string,
  projectId: string,
  input: { totalSupply?: string; allocations?: TokenAllocationInput[] }
) {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanEditProject(userId, project);

  const updateFields: Record<string, unknown> = {};

  if (input.totalSupply !== undefined) {
    const raw = typeof input.totalSupply === "string" ? input.totalSupply.trim() : "";
    updateFields.totalSupply = raw || undefined;
  }

  if (input.allocations !== undefined) {
    if (!Array.isArray(input.allocations)) {
      throw new Error("allocations must be an array");
    }
    const allocations = input.allocations
      .filter(
        (a) =>
          a &&
          typeof a.name === "string" &&
          a.name.trim().length > 0 &&
          typeof a.percentage === "number" &&
          a.percentage >= 0 &&
          a.percentage <= 100
      )
      .map((a) => ({
        id: String(a.id || uuidv4()),
        name: String(a.name).trim().slice(0, 50),
        percentage: Math.round(a.percentage * 10) / 10,
        color: /^#[0-9A-Fa-f]{6}$/.test(String(a.color || "")) ? String(a.color) : "#10B981",
      }));

    const totalPercentage = allocations.reduce((sum, a) => sum + a.percentage, 0);
    if (Math.abs(totalPercentage - 100) > 0.01) {
      throw new Error("Total percentage must equal 100%");
    }

    const isSkipPlaceholder =
      allocations.length === 1 &&
      allocations[0].name.toLowerCase() === "to be added" &&
      Math.abs(allocations[0].percentage - 100) < 0.01;

    if (!isSkipPlaceholder) {
      const effectiveTotalSupply =
        (typeof input.totalSupply === "string" ? input.totalSupply.trim() : "") ||
        (project as { totalSupply?: string }).totalSupply?.trim() ||
        "";
      if (!effectiveTotalSupply) {
        throw new Error("Total supply is required");
      }
    }

    updateFields.allocations = allocations;
  }

  if (Object.keys(updateFields).length === 0) {
    return project;
  }

  await ProjectModel.updateOne(
    { _id: projectId },
    { $set: updateFields }
  );
  const updated = await getProjectById(projectId);
  if (!updated) throw new Error("Project not found");
  logProjectChange(projectId, userId, "Updated tokenomics", "tokenomics");
  emitProjectUpdated(projectId);
  return updated;
}

export interface RoadmapPhaseInput {
  id: string;
  name: string;
  milestones: Array<{ id: string; text: string; completed: boolean }>;
}

export async function updateProjectRoadmap(
  userId: string,
  projectId: string,
  input: { phases?: RoadmapPhaseInput[] }
) {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanEditProject(userId, project);

  if (input.phases === undefined) {
    return project;
  }

  if (!Array.isArray(input.phases)) {
    throw new Error("phases must be an array");
  }

  const phases = input.phases
    .filter(
      (p) =>
        p &&
        typeof p.name === "string" &&
        p.name.trim().length > 0 &&
        Array.isArray(p.milestones)
    )
    .map((p) => ({
      id: String(p.id || uuidv4()),
      name: String(p.name).trim().slice(0, 50),
      milestones: (p.milestones || [])
        .filter(
          (m) =>
            m &&
            typeof m.text === "string" &&
            m.text.trim().length > 0
        )
        .map((m) => ({
          id: String(m.id || uuidv4()),
          text: String(m.text).trim().slice(0, 200),
          completed: Boolean(m.completed),
        })),
    }))
    .filter((p) => p.milestones.length > 0);

  await ProjectModel.updateOne(
    { _id: projectId },
    { $set: { phases } }
  );
  const updated = await getProjectById(projectId);
  if (!updated) throw new Error("Project not found");
  logProjectChange(projectId, userId, "Updated roadmap", "roadmap");
  emitProjectUpdated(projectId);
  return updated;
}

export interface FAQItemInput {
  id: string;
  question: string;
  answer: string;
}

export async function updateProjectFAQ(
  userId: string,
  projectId: string,
  input: { faqItems?: FAQItemInput[] }
) {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanEditProject(userId, project);

  if (input.faqItems === undefined) {
    return project;
  }

  if (!Array.isArray(input.faqItems)) {
    throw new Error("faqItems must be an array");
  }

  const faqItems = input.faqItems
    .filter(
      (item) =>
        item &&
        typeof item.question === "string" &&
        item.question.trim().length > 0 &&
        typeof item.answer === "string" &&
        item.answer.trim().length > 0
    )
    .map((item) => ({
      id: String(item.id || uuidv4()),
      question: String(item.question).trim().slice(0, 200),
      answer: String(item.answer).trim().slice(0, 1000),
    }));

  await ProjectModel.updateOne(
    { _id: projectId },
    { $set: { faqItems } }
  );
  const updated = await getProjectById(projectId);
  if (!updated) throw new Error("Project not found");
  logProjectChange(projectId, userId, "Updated FAQ", "faq");
  emitProjectUpdated(projectId);
  return updated;
}

export interface TeamMemberSocialInput {
  type: string;
  url: string;
}

export interface TeamMemberInput {
  id: string;
  image?: string;
  name: string;
  role: string;
  socials: TeamMemberSocialInput[];
}

export async function updateProjectTeam(
  userId: string,
  projectId: string,
  input: { teamMembers?: TeamMemberInput[] }
) {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanEditProject(userId, project);

  if (input.teamMembers === undefined) {
    return project;
  }

  if (!Array.isArray(input.teamMembers)) {
    throw new Error("teamMembers must be an array");
  }

  const teamMembers = input.teamMembers
    .filter(
      (m) =>
        m &&
        typeof m.name === "string" &&
        m.name.trim().length > 0 &&
        typeof m.role === "string" &&
        m.role.trim().length > 0
    )
    .map((m) => ({
      id: String(m.id || uuidv4()),
      image: typeof m.image === "string" && m.image.trim() ? m.image.trim() : undefined,
      name: String(m.name).trim().slice(0, 50),
      role: String(m.role).trim().slice(0, 50),
      socials: (m.socials || [])
        .filter(
          (s) =>
            s &&
            typeof s.url === "string" &&
            s.url.trim().length > 0 &&
            isValidHttpUrl(s.url.trim())
        )
        .map((s) => ({
          type: String(s.type || "other").trim().slice(0, 20).toLowerCase(),
          url: String(s.url).trim().slice(0, 500),
        })),
    }));

  await ProjectModel.updateOne(
    { _id: projectId },
    { $set: { teamMembers } }
  );
  const updated = await getProjectById(projectId);
  if (!updated) throw new Error("Project not found");
  logProjectChange(projectId, userId, "Updated team", "team");
  emitProjectUpdated(projectId);
  return updated;
}

export async function updateProjectAuditKyc(
  userId: string,
  projectId: string,
  input: {
    auditProvider?: string;
    auditLink?: string;
    kycProvider?: string;
    kycLink?: string;
  }
) {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanEditProject(userId, project);

  const auditProvider = input.auditProvider?.trim();
  const auditLink = input.auditLink?.trim();
  const kycProvider = input.kycProvider?.trim();
  const kycLink = input.kycLink?.trim();

  if (auditProvider && !auditLink) {
    throw new Error("Audit report link is required when audit provider is selected");
  }
  if (auditProvider && auditLink && !isValidHttpUrl(auditLink)) {
    throw new Error("Audit report link must be a valid URL (https:// or http://)");
  }
  if (kycProvider && !kycLink) {
    throw new Error("KYC report link is required when KYC provider is selected");
  }
  if (kycProvider && kycLink && !isValidHttpUrl(kycLink)) {
    throw new Error("KYC report link must be a valid URL (https:// or http://)");
  }

  const validAuditProvider =
    auditProvider && AUDIT_PROVIDER_IDS.includes(auditProvider as typeof AUDIT_PROVIDER_IDS[number])
      ? auditProvider
      : undefined;
  const validKycProvider =
    kycProvider && KYC_PROVIDER_IDS.includes(kycProvider as typeof KYC_PROVIDER_IDS[number])
      ? kycProvider
      : undefined;

  const setFields: Record<string, unknown> = {
    installationSteps: {
      ...project.installationSteps,
      auditKycStepCompleted: true,
    },
  };
  const unsetFields: Record<string, number> = {};

  if (validAuditProvider) {
    setFields.auditProvider = validAuditProvider;
    setFields.auditLink = auditLink;
  } else {
    unsetFields.auditProvider = 1;
    unsetFields.auditLink = 1;
  }
  if (validKycProvider) {
    setFields.kycProvider = validKycProvider;
    setFields.kycLink = kycLink;
  } else {
    unsetFields.kycProvider = 1;
    unsetFields.kycLink = 1;
  }

  const updateOp: Record<string, unknown> = { $set: setFields };
  if (Object.keys(unsetFields).length) updateOp.$unset = unsetFields;

  const updated = await ProjectModel.findByIdAndUpdate(
    projectId,
    updateOp,
    { new: true }
  ).lean();
  if (!updated) throw new Error("Project not found");
  logProjectChange(projectId, userId, "Updated audit and KYC", "links");
  emitProjectUpdated(projectId);

  return {
    id: updated._id.toString(),
    userId: updated.userId,
    prompt: updated.prompt,
    title: updated.title,
    description: updated.description,
    heroText: updated.heroText,
    socialLinks: updated.socialLinks,
    auditProvider: updated.auditProvider,
    auditLink: updated.auditLink,
    kycProvider: updated.kycProvider,
    kycLink: updated.kycLink,
    listingPlatforms: updated.listingPlatforms,
    installationSteps: updated.installationSteps,
    tokenDetails: updated.tokenDetails,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

export async function updateProjectListingPlatforms(
  userId: string,
  projectId: string,
  input: { platforms?: { providerId: string; url: string }[] }
) {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanEditProject(userId, project);

  const raw = Array.isArray(input.platforms) ? input.platforms : [];
  const listingPlatforms: ListingPlatformEntry[] = [];

  for (const x of raw) {
    if (!x || typeof x !== "object" || !("providerId" in x) || !("url" in x)) continue;
    const providerId = String(x.providerId).trim();
    const url = typeof x.url === "string" ? x.url.trim() : "";
    if (!providerId || !url) continue;
    if (!LISTING_PLATFORM_IDS.includes(providerId as typeof LISTING_PLATFORM_IDS[number])) {
      throw new Error(`Invalid listing platform: ${providerId}`);
    }
    if (!isValidHttpUrl(url)) {
      throw new Error("Each listing platform URL must be valid (https:// or http://)");
    }
    listingPlatforms.push({ providerId: providerId as ListingPlatformEntry["providerId"], url });
  }

  const updateOp: Record<string, unknown> = {};
  if (listingPlatforms.length > 0) {
    updateOp.$set = { listingPlatforms };
  } else {
    updateOp.$unset = { listingPlatforms: 1 };
  }

  const updated = await ProjectModel.findByIdAndUpdate(
    projectId,
    updateOp,
    { new: true }
  ).lean();
  if (!updated) throw new Error("Project not found");
  logProjectChange(projectId, userId, "Updated listing platforms", "links");
  emitProjectUpdated(projectId);

  return {
    id: updated._id.toString(),
    userId: updated.userId,
    prompt: updated.prompt,
    title: updated.title,
    description: updated.description,
    heroText: updated.heroText,
    socialLinks: updated.socialLinks,
    auditProvider: updated.auditProvider,
    auditLink: updated.auditLink,
    kycProvider: updated.kycProvider,
    kycLink: updated.kycLink,
    listingPlatforms: updated.listingPlatforms,
    installationSteps: updated.installationSteps,
    tokenDetails: updated.tokenDetails,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

export async function updateProjectTokenDescription(
  userId: string,
  projectId: string,
  input: { description?: string; heroText?: string }
) {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanEditProject(userId, project);
  const hasTokenDetails =
    (project.tokenDetails?.address && project.tokenDetails?.chain) ||
    (project.tokenDetails?.name && project.tokenDetails?.symbol);
  if (!hasTokenDetails) {
    throw new Error(
      "Token description can only be set for projects with token details"
    );
  }

  const hasDescriptionKey = "description" in input;
  const hasHeroTextKey = "heroText" in input;

  const description = hasDescriptionKey
    ? (input.description?.trim() || undefined)
    : undefined;
  const installationSteps = {
    ...project.installationSteps,
    descriptionStepCompleted: true,
  };

  let heroText: string | null | undefined = undefined; // undefined = don't change
  if (hasHeroTextKey) {
    // User explicitly sent heroText: use as-is (Lexical JSON) or clear if empty
    const val = input.heroText?.trim();
    heroText = val && extractLexicalText(val).trim() ? val : null;
  } else if (hasDescriptionKey && description) {
    // Only description sent: regenerate heroText from it
    const descPlain = extractLexicalText(description);
    const generated = await generateHeroText(descPlain);
    heroText = generated ? plainTextToLexicalJSON(generated) : null;
  }

  const setFields: Record<string, unknown> = { installationSteps };
  if (hasDescriptionKey && description) setFields.description = description;
  if (heroText !== undefined && heroText) setFields.heroText = heroText;

  const updateOp: Record<string, unknown> = { $set: setFields };
  const unsetFields: Record<string, number> = {};
  if (hasDescriptionKey && !description) unsetFields.description = 1;
  if (heroText !== undefined && !heroText) unsetFields.heroText = 1;
  if (Object.keys(unsetFields).length) updateOp.$unset = unsetFields;

  const updated = await ProjectModel.findByIdAndUpdate(
    projectId,
    updateOp,
    { new: true }
  ).lean();
  if (!updated) throw new Error("Project not found");
  logProjectChange(projectId, userId, "Updated project description", "general");
  emitProjectUpdated(projectId);

  // Add AI comment to chat when description or hero text was updated
  if (hasDescriptionKey || hasHeroTextKey) {
    const projectIdObj = new mongoose.Types.ObjectId(projectId);
    const descPlain = extractLexicalText(updated.description);
    const heroPlain = extractLexicalText(updated.heroText);
    const assistantContent = await generateDescriptionUpdateComment(
      descPlain,
      heroPlain
    );
    await ProjectChatMessageModel.create({
      projectId: projectIdObj,
      role: "user",
      content: "Updated project description and hero text in Settings.",
    });
    await ProjectChatMessageModel.create({
      projectId: projectIdObj,
      role: "assistant",
      content: assistantContent,
    });
  }

  return {
    id: updated._id.toString(),
    userId: updated.userId,
    prompt: updated.prompt,
    title: updated.title,
    description: updated.description,
    heroText: updated.heroText,
    installationSteps: updated.installationSteps,
    tokenDetails: updated.tokenDetails,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

export async function updateProjectTokenDetailsByNameSymbol(
  userId: string,
  projectId: string,
  input: {
    name: string;
    symbol: string;
    launchType?: string;
    launchPlatformUrl?: string;
    fromQuestionnaire?: boolean;
  }
) {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanEditProject(userId, project);

  const tokenDetails: {
    name: string;
    symbol: string;
    launchType?: string;
    launchPlatformUrl?: string;
  } = {
    name: input.name.trim(),
    symbol: input.symbol.trim(),
  };
  if (input.launchType) tokenDetails.launchType = input.launchType.trim();
  if (input.launchPlatformUrl)
    tokenDetails.launchPlatformUrl = input.launchPlatformUrl.trim();
  const newTitle = `${tokenDetails.name} - ${tokenDetails.symbol}`;

  const installationSteps = {
    ...project.installationSteps,
    tokenDetailsStepCompleted: true,
  };

  const updated = await ProjectModel.findByIdAndUpdate(
    projectId,
    { $set: { tokenDetails, title: newTitle, installationSteps } },
    { new: true }
  ).lean();
  if (!updated) throw new Error("Project not found");
  logProjectChange(projectId, userId, "Updated token name and symbol", "general");
  emitProjectUpdated(projectId);

  const summary = buildTokenSummary(updated.tokenDetails);
  const tokenSavedContent = buildTokenBrief(updated.tokenDetails, summary);

  const projectIdObj = new mongoose.Types.ObjectId(projectId);
  if (!input.fromQuestionnaire) {
    const lastMessage = await ProjectChatMessageModel.findOne(
      { projectId: projectIdObj },
      {},
      { sort: { createdAt: -1 } }
    ).lean();
    const lastIsUser = lastMessage?.role === "user";
    if (lastIsUser) {
      const parts = [
        `Token name: ${tokenDetails.name}`,
        `Token symbol: ${tokenDetails.symbol}`,
      ];
      if (tokenDetails.launchType)
        parts.push(`Launch type: ${tokenDetails.launchType}`);
      if (tokenDetails.launchPlatformUrl)
        parts.push(`Launch platform: ${tokenDetails.launchPlatformUrl}`);
      const userContent = parts.join("\n");
      await ProjectChatMessageModel.create({
        projectId: projectIdObj,
        role: "user",
        content: userContent,
      });
      await ProjectChatMessageModel.create({
        projectId: projectIdObj,
        role: "assistant",
        content: tokenSavedContent,
      });
    }
  }

  return {
    id: updated._id.toString(),
    userId: updated.userId,
    prompt: updated.prompt,
    title: updated.title,
    description: updated.description,
    installationSteps: updated.installationSteps,
    tokenDetails: updated.tokenDetails,
    tokenSummary: summary,
    tokenBrief: tokenSavedContent,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

function buildTokenSummary(td: { symbol?: string; name?: string; price?: number; market_cap?: number; price_change_24h?: number } | undefined): string {
  if (!td) return "";
  const symbol = td.symbol || "Token";
  const name = td.name ? ` (${td.name})` : "";
  const price = td.price != null ? ` $${formatNum(td.price)}` : "";
  const mcap = td.market_cap != null ? ` | MCap $${formatNum(td.market_cap, true)}` : "";
  const change = td.price_change_24h != null ? ` | 24h ${td.price_change_24h >= 0 ? "+" : ""}${td.price_change_24h.toFixed(2)}%` : "";
  return `${symbol}${name}${price}${mcap}${change}`.trim();
}

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

export type ProjectListItem = Awaited<ReturnType<typeof getProjectById>> & {
  starred?: boolean;
};

export async function listProjectsByUser(
  userId: string,
  options?: { starredOnly?: boolean; workspaceId?: string; sharedWithMe?: boolean; allWorkspaces?: boolean; folderId?: string }
): Promise<ProjectListItem[]> {
  let workspaceFilter: Record<string, unknown> = {};
  if (options?.folderId) {
    workspaceFilter.folderId = new mongoose.Types.ObjectId(options.folderId);
  }
  if (options?.folderId) {
    // When filtering by folder, we still need workspace/user context from the folder
    // The folder filter is already set above
  } else if (options?.allWorkspaces) {
    const memberships = await WorkspaceMemberModel.find({ userId })
      .select("workspaceId")
      .lean();
    const workspaceIds = memberships.map((m) => m.workspaceId).filter(Boolean);
    workspaceFilter =
      workspaceIds.length > 0
        ? {
            $or: [
              { workspaceId: { $in: workspaceIds } },
              { userId, $or: [{ workspaceId: { $exists: false } }, { workspaceId: null }] },
            ],
          }
        : { userId };
  } else if (options?.workspaceId) {
    workspaceFilter = { workspaceId: new mongoose.Types.ObjectId(options.workspaceId) };
  }

  if (options?.sharedWithMe) {
    const memberships = await WorkspaceMemberModel.find({ userId })
      .select("workspaceId")
      .lean();
    const workspaceIds = memberships.map((m) => m.workspaceId);
    if (workspaceIds.length === 0) return [];
    const sharedQuery: Record<string, unknown> = {
      workspaceId: { $in: workspaceIds },
      userId: { $ne: userId },
    };
    if (options?.workspaceId) {
      sharedQuery.workspaceId = new mongoose.Types.ObjectId(options.workspaceId);
    }
    const projects = await ProjectModel.find(sharedQuery)
      .sort({ updatedAt: -1 })
      .lean();
    const ids = projects.map((p) => p._id);
    const starredSet = new Set(
      (
        await StarredProjectModel.find({
          userId,
          projectId: { $in: ids },
        })
          .select("projectId")
          .lean()
      ).map((s) => s.projectId.toString())
    );
    return projects.map((p) => ({
      id: p._id.toString(),
      userId: p.userId,
      workspaceId: p.workspaceId,
      folderId: p.folderId?.toString() ?? null,
      prompt: p.prompt,
      title: p.title,
      description: p.description,
      category: p.category,
      heroText: p.heroText,
      socialLinks: migrateSocialLinks(p.socialLinks),
      auditProvider: p.auditProvider,
      auditLink: p.auditLink,
      kycProvider: p.kycProvider,
      kycLink: p.kycLink,
      listingPlatforms: p.listingPlatforms,
      installationSteps: p.installationSteps,
      tokenDetails: p.tokenDetails,
      templateId: p.templateId,
      fontFamily: p.fontFamily,
      colorSchemaId: p.colorSchemaId,
      sectionVisibility: p.sectionVisibility,
      sectionOrder: p.sectionOrder,
      sectionCustomization: (p as { sectionCustomization?: Record<string, { layout?: { type?: string } }> }).sectionCustomization,
      hideToklyBadge: p.hideToklyBadge,
      projectVisibility: p.projectVisibility ?? "workshop",
      favicon: p.favicon,
      seoTitle: p.seoTitle,
      seoDescription: p.seoDescription,
      ogImage: p.ogImage,
      thumbnailUrl: p.thumbnailUrl,
      subdomain: p.subdomain,
      domain: p.domain,
      published: p.published,
      totalSupply: (p as { totalSupply?: string }).totalSupply,
      allocations: (p as { allocations?: Array<{ id: string; name: string; percentage: number; color: string }> }).allocations,
      phases: (p as { phases?: Array<{ id: string; name: string; milestones: Array<{ id: string; text: string; completed: boolean }> }> }).phases,
      faqItems: (p as { faqItems?: Array<{ id: string; question: string; answer: string }> }).faqItems,
      teamMembers: (p as { teamMembers?: Array<{ id: string; image?: string; name: string; role: string; socials: Array<{ type: string; url: string }> }> }).teamMembers,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      starred: starredSet.has(p._id.toString()),
    }));
  }

  if (options?.starredOnly) {
    const starred = await StarredProjectModel.find({ userId })
      .select("projectId")
      .lean();
    const projectIds = starred.map((s) => s.projectId);
    const starredQuery: Record<string, unknown> = {
      _id: { $in: projectIds },
      ...workspaceFilter,
    };
    if (!options?.workspaceId) {
      starredQuery.userId = userId;
    }
    const projects = await ProjectModel.find(starredQuery)
      .sort({ updatedAt: -1 })
      .lean();
    return projects.map((p) => ({
      id: p._id.toString(),
      userId: p.userId,
      workspaceId: p.workspaceId,
      folderId: p.folderId?.toString() ?? null,
      prompt: p.prompt,
      title: p.title,
      description: p.description,
      category: p.category,
      heroText: p.heroText,
      socialLinks: migrateSocialLinks(p.socialLinks),
      auditProvider: p.auditProvider,
      auditLink: p.auditLink,
      kycProvider: p.kycProvider,
      kycLink: p.kycLink,
      listingPlatforms: p.listingPlatforms,
      installationSteps: p.installationSteps,
      tokenDetails: p.tokenDetails,
      templateId: p.templateId,
      fontFamily: p.fontFamily,
      colorSchemaId: p.colorSchemaId,
      sectionVisibility: p.sectionVisibility,
      sectionOrder: p.sectionOrder,
      sectionCustomization: (p as { sectionCustomization?: Record<string, { layout?: { type?: string } }> }).sectionCustomization,
      hideToklyBadge: p.hideToklyBadge,
      projectVisibility: p.projectVisibility ?? "workshop",
      favicon: p.favicon,
      seoTitle: p.seoTitle,
      seoDescription: p.seoDescription,
      ogImage: p.ogImage,
      thumbnailUrl: p.thumbnailUrl,
      subdomain: p.subdomain,
      domain: p.domain,
      published: p.published,
      totalSupply: (p as { totalSupply?: string }).totalSupply,
      allocations: (p as { allocations?: Array<{ id: string; name: string; percentage: number; color: string }> }).allocations,
      phases: (p as { phases?: Array<{ id: string; name: string; milestones: Array<{ id: string; text: string; completed: boolean }> }> }).phases,
      faqItems: (p as { faqItems?: Array<{ id: string; question: string; answer: string }> }).faqItems,
      teamMembers: (p as { teamMembers?: Array<{ id: string; image?: string; name: string; role: string; socials: Array<{ type: string; url: string }> }> }).teamMembers,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      starred: true,
    }));
  }

  const listQuery: Record<string, unknown> = { ...workspaceFilter };
  if (options?.folderId) {
    // Folder view: no extra filter; access was checked when loading the folder
  } else if (!options?.workspaceId && !options?.allWorkspaces) {
    listQuery.userId = userId;
  }
  const projects = await ProjectModel.find(listQuery)
    .sort({ updatedAt: -1 })
    .lean();
  const ids = projects.map((p) => p._id);
  const starredSet = new Set(
    (
      await StarredProjectModel.find({
        userId,
        projectId: { $in: ids },
      })
        .select("projectId")
        .lean()
    ).map((s) => s.projectId.toString())
  );
  return projects.map((p) => ({
    id: p._id.toString(),
    userId: p.userId,
    workspaceId: p.workspaceId,
    folderId: p.folderId?.toString() ?? null,
    prompt: p.prompt,
    title: p.title,
    description: p.description,
    category: p.category,
    heroText: p.heroText,
    socialLinks: migrateSocialLinks(p.socialLinks),
    auditProvider: p.auditProvider,
    auditLink: p.auditLink,
    kycProvider: p.kycProvider,
    kycLink: p.kycLink,
    listingPlatforms: p.listingPlatforms,
    installationSteps: p.installationSteps,
    tokenDetails: p.tokenDetails,
    templateId: p.templateId,
    fontFamily: p.fontFamily,
    colorSchemaId: p.colorSchemaId,
    sectionVisibility: p.sectionVisibility,
    sectionOrder: p.sectionOrder,
    sectionCustomization: (p as { sectionCustomization?: Record<string, { layout?: { type?: string } }> }).sectionCustomization,
    hideToklyBadge: p.hideToklyBadge,
    projectVisibility: p.projectVisibility ?? "workshop",
    favicon: p.favicon,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    ogImage: p.ogImage,
    thumbnailUrl: p.thumbnailUrl,
    subdomain: p.subdomain,
    domain: p.domain,
    published: p.published,
    totalSupply: (p as { totalSupply?: string }).totalSupply,
    allocations: (p as { allocations?: Array<{ id: string; name: string; percentage: number; color: string }> }).allocations,
    phases: (p as { phases?: Array<{ id: string; name: string; milestones: Array<{ id: string; text: string; completed: boolean }> }> }).phases,
    faqItems: (p as { faqItems?: Array<{ id: string; question: string; answer: string }> }).faqItems,
    teamMembers: (p as { teamMembers?: Array<{ id: string; image?: string; name: string; role: string; socials: Array<{ type: string; url: string }> }> }).teamMembers,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    starred: starredSet.has(p._id.toString()),
  }));
}

export type PublicProjectSummary = {
  id: string;
  title?: string;
  description?: string;
  heroText?: string;
  ogImage?: string;
  thumbnailUrl?: string;
  subdomain?: string;
  domain?: string;
  published?: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export async function listPublicProjectsByUserId(
  userId: string
): Promise<PublicProjectSummary[]> {
  const projects = await ProjectModel.find({
    userId,
    projectVisibility: "public",
  })
    .sort({ updatedAt: -1 })
    .select(
      "_id title description heroText ogImage thumbnailUrl subdomain domain published createdAt updatedAt"
    )
    .lean();

  return projects.map((p) => ({
    id: p._id.toString(),
    title: p.title,
    description: p.description,
    heroText: p.heroText,
    ogImage: p.ogImage,
    thumbnailUrl: p.thumbnailUrl,
    subdomain: p.subdomain,
    domain: p.domain,
    published: p.published ?? false,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));
}

export async function starProject(
  userId: string,
  projectId: string
): Promise<void> {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  const { ensureUserCanAccessWorkspace } = await import("./workspaceService");
  const workspaceId = project.workspaceId?.toString();
  if (workspaceId) {
    const canAccess = await ensureUserCanAccessWorkspace(userId, workspaceId);
    if (!canAccess) throw new Error("Forbidden");
  } else if (project.userId !== userId) {
    throw new Error("Forbidden");
  }
  await StarredProjectModel.findOneAndUpdate(
    { userId, projectId: new mongoose.Types.ObjectId(projectId) },
    { $setOnInsert: { userId, projectId: new mongoose.Types.ObjectId(projectId) } },
    { upsert: true }
  );
}

export async function unstarProject(
  userId: string,
  projectId: string
): Promise<void> {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  const { ensureUserCanAccessWorkspace } = await import("./workspaceService");
  const workspaceId = project.workspaceId?.toString();
  if (workspaceId) {
    const canAccess = await ensureUserCanAccessWorkspace(userId, workspaceId);
    if (!canAccess) throw new Error("Forbidden");
  } else if (project.userId !== userId) {
    throw new Error("Forbidden");
  }
  await StarredProjectModel.deleteOne({
    userId,
    projectId: new mongoose.Types.ObjectId(projectId),
  });
}

export async function deleteProject(
  userId: string,
  projectId: string
): Promise<void> {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanEditProject(userId, project);
  const workspaceId = project.workspaceId?.toString();
  const projectIdObj = new mongoose.Types.ObjectId(projectId);
  await Promise.all([
    ProjectChatMessageModel.deleteMany({ projectId: projectIdObj }),
    StarredProjectModel.deleteMany({ projectId: projectIdObj }),
    ProjectFileModel.deleteMany({ projectId: projectIdObj }),
  ]);
  await ProjectModel.findByIdAndDelete(projectIdObj);
  if (workspaceId) emitProjectsUpdated(workspaceId);
}
