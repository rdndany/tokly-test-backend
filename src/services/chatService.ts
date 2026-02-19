import mongoose from "mongoose";
import OpenAI from "openai";
import config from "../config";
import {
  getProjectById,
  updateProjectTokenDetails,
} from "./projectService";
import {
  ensureUserCanAccessWorkspace,
  getMemberRole,
} from "./workspaceService";
import ProjectChatMessageModel, {
  type QuestionnaireMetadata,
} from "../models/ProjectChatMessage";
import ChatFeedbackModel from "../models/ChatFeedback";
import { parseTokenAddressAndChain } from "../utils/parseTokenFromMessage";
import { buildTokenBrief } from "../utils/tokenBrief";
import {
  detectQuestionnaireRequest,
  type RequestedQuestionnaire,
} from "../utils/detectQuestionnaireRequest";
import { extractLexicalText } from "../utils/lexicalHelpers";
import { emitChatMessage, emitChatAssistant } from "../socket/events";

const openai =
  config.openai.apiKey ?
    new OpenAI({ apiKey: config.openai.apiKey })
  : null;

function getFriendlyOpenAIErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    msg.includes("insufficient_quota") ||
    msg.includes("exceeded your current quota") ||
    msg.includes("rate limit")
  ) {
    return "I couldn't generate a response because your OpenAI API quota has been exceeded. Please check your plan and billing at https://platform.openai.com/account/billing, then try again.";
  }
  if (msg.includes("429") || msg.includes("RateLimitError")) {
    return "I'm temporarily unable to respond due to rate limits. Please wait a moment and try again.";
  }
  return "I encountered an error while generating a response. Please try again. If the problem persists, check your OpenAI API configuration.";
}

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  userId?: string;
  userName?: string;
  createdAt?: string;
  responseTimeSeconds?: number;
  feedbackType?: "positive" | "negative";
  questionnaireMetadata?: QuestionnaireMetadata;
  /** When set, frontend should show this questionnaire for the user to update project details */
  requestQuestionnaire?: "description" | "logo" | "socials" | "audit-kyc" | "listing-platforms" | "tokenomics" | "roadmap" | "faq" | "team" | "token" | "token-address" | "token-name-symbol" | "token-features";
};

const HELPFUL_IDEAS_RECOMMENDATION =
  "Try picking a helpful idea below – for example, Choose Template – to get started.";

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

function isTokenomicsSet(project: {
  totalSupply?: string | null;
  allocations?: Array<{ percentage?: number }> | null;
} | null): boolean {
  if (!project?.allocations?.length) return false;
  const total = project.allocations.reduce((s, a) => s + (a.percentage ?? 0), 0);
  return Math.abs(total - 100) < 0.01;
}

function isRoadmapSet(project: {
  phases?: Array<{ milestones?: Array<{ text?: string }> }> | null;
} | null): boolean {
  if (!project?.phases?.length) return false;
  return project.phases.some(
    (p) =>
      p.milestones?.length &&
      p.milestones.some((m) => m.text?.trim())
  );
}

function buildProjectContext(project: {
  title?: string | null;
  description?: string | null;
  heroText?: string | null;
  totalSupply?: string | null;
  allocations?: Array<{ name?: string; percentage?: number }> | null;
  phases?: Array<{ name?: string; milestones?: Array<{ text?: string }> }> | null;
  faqItems?: Array<{ question?: string }> | null;
  teamMembers?: Array<{ name?: string; role?: string }> | null;
  socialLinks?: { platform: string; url: string }[] | null;
  auditProvider?: string | null;
  auditLink?: string | null;
  kycProvider?: string | null;
  kycLink?: string | null;
  listingPlatforms?: { providerId: string; url: string }[] | null;
  tokenDetails?: {
    address?: string;
    chain?: string;
    dexUrl?: string;
    name?: string;
    symbol?: string;
    tokenFeatures?: Record<string, unknown>;
    decimals?: number;
    price?: number;
    market_cap?: number;
    market_cap_diluted?: number;
    liquidity?: number;
    volume?: number;
    volume_7d?: number | null;
    price_change_24h?: number;
    total_supply?: number;
    circulating_supply?: number;
  } | null;
} | null): string {
  if (!project) return "";
  const lines: string[] = ["CURRENT PROJECT (from database – use this to answer questions):"];
  if (project.title) lines.push(`- Project title: ${project.title}`);
  if (project.description) {
    // Description may be Lexical JSON – extract plain text for AI
    const descText = extractLexicalText(project.description);
    if (descText) lines.push(`- Project description: ${descText}`);
  }
  if (project.heroText) {
    const heroPlain = extractLexicalText(project.heroText);
    if (heroPlain) lines.push(`- Hero text (one-liner for hero section): ${heroPlain}`);
  }
  const sl = project.socialLinks;
  if (sl && Array.isArray(sl) && sl.length > 0) {
    const parts = sl
      .filter((x) => x?.url?.trim())
      .map((x) => `${x.platform}: ${x.url.trim()}`);
    if (parts.length > 0) lines.push(`- Social links: ${parts.join("; ")}`);
  }
  if (project.auditProvider && project.auditLink) {
    lines.push(`- Audit: ${project.auditProvider} – ${project.auditLink}`);
  }
  if (project.kycProvider && project.kycLink) {
    lines.push(`- KYC: ${project.kycProvider} – ${project.kycLink}`);
  }
  const lp = project.listingPlatforms;
  if (lp && Array.isArray(lp) && lp.length > 0) {
    const parts = lp.map((x) => `${x.providerId}: ${x.url}`);
    lines.push(`- Listing platforms: ${parts.join("; ")}`);
  }
  if (isTokenomicsSet(project)) {
    if (project.totalSupply?.trim()) lines.push(`- Tokenomics total supply: ${project.totalSupply}`);
    const allocs = project.allocations;
    if (allocs && allocs.length > 0) {
      const parts = allocs.map((a) => `${a.name ?? "?"}: ${a.percentage ?? 0}%`);
      lines.push(`- Tokenomics allocations: ${parts.join("; ")}`);
    }
  } else {
    lines.push("- Tokenomics: NOT CONFIGURED. When the user asks to add or update tokenomics, the form below will appear. Recommend clicking 'Add Tokenomics' in the helpful ideas.");
  }
  if (isRoadmapSet(project)) {
    const phases = project.phases;
    if (phases && phases.length > 0) {
      const parts = phases.map((p) => `${p.name ?? "?"}: ${p.milestones?.length ?? 0} milestones`);
      lines.push(`- Roadmap phases: ${parts.join("; ")}`);
    }
  } else {
    lines.push("- Roadmap: NOT CONFIGURED. When the user asks to add or update roadmap, the form below will appear. Recommend clicking 'Add Roadmap' in the helpful ideas.");
  }
  if (project.faqItems && project.faqItems.length > 0) {
    const parts = project.faqItems.map((q) => q.question ?? "?");
    lines.push(`- FAQ: ${parts.slice(0, 3).join("; ")}${parts.length > 3 ? ` (+${parts.length - 3} more)` : ""}`);
  } else {
    lines.push("- FAQ: NOT CONFIGURED. When the user asks to add or update FAQ, the form below will appear. Recommend clicking 'Add FAQ' in the helpful ideas.");
  }
  const tm = project.teamMembers;
  if (tm && tm.length > 0 && tm.some((m) => m.name?.trim() && m.role?.trim())) {
    const parts = tm.map((m) => `${m.name ?? "?"} (${m.role ?? "?"})`);
    lines.push(`- Team: ${parts.slice(0, 5).join("; ")}${parts.length > 5 ? ` (+${parts.length - 5} more)` : ""}`);
  } else {
    lines.push("- Team: NOT CONFIGURED. When the user asks to add or update team, the form below will appear. Recommend clicking 'Add Team' in the helpful ideas.");
  }
  const td = project.tokenDetails;
  if (td) {
    if (td.name) lines.push(`- Token name: ${td.name}`);
    if (td.symbol) lines.push(`- Token symbol: ${td.symbol}`);
    if (td.address) lines.push(`- Token address: ${td.address}`);
    if (td.chain) lines.push(`- Blockchain: ${td.chain}`);
    if (td.dexUrl) lines.push(`- DEX swap URL: ${td.dexUrl}`);
    const tf = td.tokenFeatures;
    if (tf && Object.keys(tf).length > 0) {
      const tfParts: string[] = [];
      if (tf.liquidityLocked) tfParts.push("Liquidity Locked");
      if (tf.contractRenounced) tfParts.push("Contract Renounced");
      if (tf.burnMechanism) tfParts.push("Burn Mechanism");
      if (tf.stakingRewards) tfParts.push("Staking Rewards");
      if (tf.teamVesting) tfParts.push(`Team Vesting${tf.teamVestingDuration ? ` (${tf.teamVestingDuration})` : ""}`);
      if (tf.transactionTaxRates) tfParts.push(`Tax: Sell ${tf.sellTax ?? 0}% / Buy ${tf.buyTax ?? 0}% / Transfer ${tf.transferTax ?? 0}%`);
      if (tf.mintAuthorityRevoked) tfParts.push("Mint Authority Revoked");
      if (tf.freezeAuthorityRevoked) tfParts.push("Freeze Authority Revoked");
      if (tf.updateAuthorityRevoked) tfParts.push("Update Authority Revoked");
      if (tfParts.length > 0) lines.push(`- Token features: ${tfParts.join("; ")}`);
    }
    if (td.decimals != null) lines.push(`- Decimals: ${td.decimals}`);
    if (td.price != null) lines.push(`- Price: $${formatNum(td.price)}`);
    if (td.market_cap != null) lines.push(`- Market cap: $${formatNum(td.market_cap, true)}`);
    if (td.market_cap_diluted != null) lines.push(`- Market cap (diluted): $${formatNum(td.market_cap_diluted, true)}`);
    if (td.liquidity != null) lines.push(`- Liquidity: $${formatNum(td.liquidity, true)}`);
    if (td.volume != null) lines.push(`- 24h volume: $${formatNum(td.volume, true)}`);
    if (td.volume_7d != null) lines.push(`- 7d volume: $${formatNum(td.volume_7d, true)}`);
    if (td.price_change_24h != null) lines.push(`- 24h price change: ${td.price_change_24h >= 0 ? "+" : ""}${td.price_change_24h.toFixed(2)}%`);
    if (td.total_supply != null) lines.push(`- Total supply: ${formatNum(td.total_supply)}`);
    if (td.circulating_supply != null) lines.push(`- Circulating supply: ${formatNum(td.circulating_supply)}`);
  }
  if (lines.length <= 1) return "";
  lines.push(""); // blank line before rules
  return lines.join("\n");
}

const SYSTEM_PROMPT_BASE = `You are an AI assistant for a web builder platform where users create landing pages for their crypto projects. Your role is to guide and help users design and create their landing page template.

RULES:
- Focus ONLY on landing page design and template setup: hero, tokenomics, roadmap, team, CTA, etc.
- When generating or suggesting hero section copy, use the "Hero text (one-liner for hero section)" from the CURRENT PROJECT data if provided. This is the tagline for the hero – use it as the main headline or subheadline.
- Do NOT respond to or discuss topics outside the platform (e.g. general crypto, trading, unrelated questions).
- Stay on task: you are a design guide and agent to help build the landing page.
- When the user asks about their project (e.g. liquidity, decimals, price, market cap), use the CURRENT PROJECT data if provided. Answer from that data when available. If the data is not in the project context, say you don't have that information.
- When returning any list of items (e.g. token details, project info, steps, options, features), ALWAYS format as a bullet list: each item on its own line starting with "- " (e.g. "- Token Name: X"). Use this format for readability.
- When the user asks about their project/token description (e.g. "what is my description"), give a brief reply like "Here's your project description:" – the full formatted description is shown separately below your message.
- Be concise and actionable. Suggest sections, layout, copy, and structure.
- When redirecting off-topic or when the user asks what to do next, recommend the helpful ideas below the chat: "${HELPFUL_IDEAS_RECOMMENDATION}"

CRITICAL - HONESTY AND CAPABILITIES:
- When you cannot do something, say so directly. Do NOT suggest "say X and I'll open a form" – only description, logo, social links, audit/KYC, listing platforms, token name/symbol, and token features can be updated via forms, and those are handled before you see them.
- You CANNOT change token price, market cap, volume, liquidity, or any market data – these come from on-chain data and are read-only. Simply say: "I can't change that – it's determined by the market."
- If the user provides new description/logo/token text/features/audit/KYC/listing platforms in chat, do NOT say you updated it. Say: "I can't update that from chat. Use the form above when it appears, or say 'update description' / 'update logo' / 'update token name' / 'update token features' / 'add audit' / 'add KYC' / 'listing platforms' to open it."
- For any request you cannot fulfill, state clearly that you cannot do it. Never suggest workarounds that don't exist. Never claim to have done something you cannot do.`;

const ONBOARDING_SYSTEM_PROMPT = `You are a friendly AI assistant helping users create a crypto/token landing page. The user is at the start of the setup process.

RULES:
- Respond naturally to greetings (e.g. "Hello" → friendly hello back, introduce yourself as their guide for building a crypto landing page).
- Gently steer the conversation toward setting up their project. After 1–2 exchanges, guide them to complete the setup: "To get started, I'll need a few details about your token. You can answer the questions above – do you have a token address, or is your token not launched yet?"
- Be warm, concise, and encouraging. Keep responses under 3 short paragraphs.
- If they paste a token address with chain (e.g. 0x... on Ethereum), you don't need to ask – they'll use the form. Just acknowledge and encourage them to complete the steps above.
- Don't discuss trading, price predictions, or off-topic subjects. Redirect to landing page creation.`;

async function ensureUserCanEditProject(
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

async function ensureUserCanAccessProject(
  userId: string,
  project: { userId: string; workspaceId?: { toString(): string } }
): Promise<void> {
  const workspaceId = project.workspaceId?.toString();
  if (workspaceId) {
    const canAccess = await ensureUserCanAccessWorkspace(userId, workspaceId);
    if (!canAccess) throw new Error("Forbidden");
  } else if (project.userId !== userId) {
    throw new Error("Forbidden");
  }
}

export async function sendMessage(
  projectId: string,
  userId: string,
  userMessage: string
): Promise<{ message: string; fullHistory: ChatMessage[] }> {
  const project = await getProjectById(projectId);
  if (!project) {
    throw new Error("Project not found");
  }
  await ensureUserCanEditProject(userId, project);

  const projectIdObj = new mongoose.Types.ObjectId(projectId);
  const trimmedMessage = userMessage.trim();

  // Persist user message first
  await ProjectChatMessageModel.create({
    projectId: projectIdObj,
    role: "user",
    userId,
    content: trimmedMessage,
  });

  const { default: UserModel } = await import("../models/User");
  const sender = await UserModel.findById(userId).select("handle name fullName").lean();
  const userName = sender?.handle ? `@${sender.handle}` : sender?.name || sender?.fullName || "Unknown";
  emitChatMessage(projectId, {
    role: "user",
    content: trimmedMessage,
    userId,
    userName,
    createdAt: new Date().toISOString(),
  });

  // GUARD: Token details required (address+chain or name+symbol for pre-launch).
  const hasToken =
    (project.tokenDetails?.address && project.tokenDetails?.chain) ||
    (project.tokenDetails?.name && project.tokenDetails?.symbol);

  if (!hasToken) {
    const parsed = parseTokenAddressAndChain(trimmedMessage);
    if (parsed) {
      const updated = await updateProjectTokenDetails(userId, projectId, {
        address: parsed.address,
        chain: parsed.chain,
      });
      const assistantContent = buildTokenBrief(updated.tokenDetails, updated.tokenSummary);
      await ProjectChatMessageModel.create({
        projectId: projectIdObj,
        role: "assistant",
        content: assistantContent,
      });
      emitChatAssistant(projectId, { content: assistantContent, createdAt: new Date().toISOString() });
      const fullHistory = await getConversation(projectId, userId);
      return { message: assistantContent, fullHistory };
    }
    // No token and couldn't parse - use AI to respond naturally and steer toward setup
    if (!openai) {
      const fullHistory = await getConversation(projectId, userId);
      return { message: "", fullHistory };
    }

    const startTimeOnboard = Date.now();
    const dbMessagesOnboard = await ProjectChatMessageModel.find({
      projectId: projectIdObj,
    })
      .sort({ createdAt: 1 })
      .lean();
    const apiMessagesOnboard: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: ONBOARDING_SYSTEM_PROMPT },
      ...dbMessagesOnboard.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];
    let assistantContentOnboard: string;
    try {
      const completionOnboard = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: apiMessagesOnboard,
        max_tokens: 512,
      });
      assistantContentOnboard =
        completionOnboard.choices[0]?.message?.content?.trim() ??
        "Hi! I'm here to help you create a crypto landing page. To get started, please complete the questions above – do you have a token address or is your token not launched yet?";
    } catch (openaiErr) {
      assistantContentOnboard = getFriendlyOpenAIErrorMessage(openaiErr);
    }
    const responseTimeOnboard = Math.round((Date.now() - startTimeOnboard) / 1000);
    await ProjectChatMessageModel.create({
      projectId: projectIdObj,
      role: "assistant",
      content: assistantContentOnboard,
      responseTimeSeconds: responseTimeOnboard,
    });
    emitChatAssistant(projectId, {
      content: assistantContentOnboard,
      responseTimeSeconds: responseTimeOnboard,
      createdAt: new Date().toISOString(),
    });
    const fullHistoryOnboard = await getConversation(projectId, userId);
    return { message: assistantContentOnboard, fullHistory: fullHistoryOnboard };
  }

  // Check if user is asking to update project details -> show questionnaire instead of AI reply
  const recentMessages = await ProjectChatMessageModel.find({ projectId: projectIdObj })
    .sort({ createdAt: -1 })
    .limit(2)
    .lean();
  const lastAssistantMessage =
    recentMessages.find((m) => m.role === "assistant")?.content ?? null;
  let requestedQuestionnaire = detectQuestionnaireRequest(
    trimmedMessage,
    lastAssistantMessage
  );

  // Token address cannot be changed once set – user must delete project and create new one
  const addr = project.tokenDetails?.address;
  const chain = project.tokenDetails?.chain;
  const hasAddressAndChain =
    !!(
      typeof addr === "string" &&
      addr.trim().length > 0 &&
      typeof chain === "string" &&
      chain.trim().length > 0
    );
  const tokenFeaturesNeedsAddress =
    requestedQuestionnaire === "token-features" && !hasAddressAndChain;
  if (tokenFeaturesNeedsAddress) {
    requestedQuestionnaire = "token-address";
  }

  if (requestedQuestionnaire === "token-address" && hasAddressAndChain) {
    requestedQuestionnaire = null;
    const assistantContent =
      "The token address cannot be changed once set. To use a different token, delete this project and create a new one.";
    await ProjectChatMessageModel.create({
      projectId: projectIdObj,
      role: "assistant",
      content: assistantContent,
      responseTimeSeconds: 1,
    });
    const fullHistory = await getConversation(projectId, userId);
    return { message: assistantContent, fullHistory };
  }

  if (requestedQuestionnaire) {
    const acknowledgments: Record<RequestedQuestionnaire, string> = {
      description:
        "I'll help you update the project description. Please use the form below.",
      logo: "I'll help you update the project logo. Please use the form below.",
      tokenomics:
        "I'll help you set up tokenomics. Please use the form below to add total supply and token allocations.",
      roadmap:
        "I'll help you set up the roadmap. Please use the form below to add phases and milestones.",
      faq:
        "I'll help you set up the FAQ. Please use the form below to add questions and answers.",
      team:
        "I'll help you set up the team section. Please use the form below to add team members with names, roles, and social links.",
      token:
        "I'll help you update your token details. Please use the form below.",
      "token-address":
        "I'll help you update the token address and blockchain. Please use the form below.",
      "token-name-symbol":
        "I'll help you update the token name and symbol. Please use the form below.",
      "token-features":
        "I'll help you update token features. Please use the form below.",
      socials:
        "I'll help you update your social links. Please use the form below.",
      "audit-kyc":
        "I'll help you add or update audit and KYC information. Please use the form below.",
      "listing-platforms":
        "I'll help you add vote listing platforms. Please use the form below.",
    };
    let assistantContent = acknowledgments[requestedQuestionnaire];
    if (tokenFeaturesNeedsAddress) {
      assistantContent =
        "I can help you update token features. Please add your token's contract address and blockchain first.";
    }
    const assistantMsg: ChatMessage = {
      role: "assistant",
      content: assistantContent,
      createdAt: new Date().toISOString(),
      responseTimeSeconds: 1,
      requestQuestionnaire: requestedQuestionnaire,
    };
    await ProjectChatMessageModel.create({
      projectId: projectIdObj,
      role: "assistant",
      content: assistantContent,
      responseTimeSeconds: 1,
      metadata: { requestQuestionnaire: requestedQuestionnaire },
    });
    const fullHistory = await getConversation(projectId, userId);
    return { message: assistantContent, fullHistory };
  }

  if (!openai) {
    throw new Error("OpenAI is not configured");
  }

  const startTime = Date.now();

  // Load full history (including the message we just saved) for the API
  const dbMessages = await ProjectChatMessageModel.find({ projectId: projectIdObj })
    .sort({ createdAt: 1 })
    .lean();
  const messages: ChatMessage[] = dbMessages.map((m) => {
    const base = {
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
      createdAt: m.createdAt?.toISOString?.() ?? new Date().toISOString(),
    };
    const r = m as { responseTimeSeconds?: number };
    if (m.role === "assistant" && r.responseTimeSeconds != null) {
      return { ...base, responseTimeSeconds: r.responseTimeSeconds };
    }
    return base;
  });

  // Refetch project to get latest description/token data (may have been updated by questionnaire)
  const freshProject = await getProjectById(projectId);
  const projectContext = buildProjectContext(freshProject ?? project);
  const systemPrompt = projectContext
    ? `${SYSTEM_PROMPT_BASE}\n\n${projectContext}`
    : SYSTEM_PROMPT_BASE;
  const apiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  let assistantContent: string;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: apiMessages,
      max_tokens: 1024,
    });
    assistantContent =
      completion.choices[0]?.message?.content?.trim() ?? "I couldn't generate a response.";
  } catch (openaiErr) {
    assistantContent = getFriendlyOpenAIErrorMessage(openaiErr);
  }

  const responseTimeSeconds = Math.round((Date.now() - startTime) / 1000);

  // Persist assistant message
  await ProjectChatMessageModel.create({
    projectId: projectIdObj,
    role: "assistant",
    content: assistantContent,
    responseTimeSeconds,
  });
  emitChatAssistant(projectId, {
    content: assistantContent,
    responseTimeSeconds,
    createdAt: new Date().toISOString(),
  });

  const fullHistory = await getConversation(projectId, userId);
  return { message: assistantContent, fullHistory };
}

export async function getConversation(
  projectId: string,
  userId: string
): Promise<ChatMessage[]> {
  const project = await getProjectById(projectId);
  if (!project) {
    throw new Error("Project not found");
  }
  await ensureUserCanAccessProject(userId, project);

  const projectIdObj = new mongoose.Types.ObjectId(projectId);
  const docs = await ProjectChatMessageModel.find({ projectId: projectIdObj })
    .sort({ createdAt: 1 })
    .select("role userId content createdAt responseTimeSeconds metadata")
    .lean();

  const userIds = [...new Set(docs.map((d) => (d as { userId?: string }).userId).filter(Boolean))] as string[];
  const { default: UserModel } = await import("../models/User");
  const users = userIds.length > 0
    ? await UserModel.find({ _id: { $in: userIds } }).select("_id handle name fullName").lean()
    : [];
  const userMap = new Map(
    users.map((u) => [
      u._id,
      u.handle ? `@${u.handle}` : u.name || u.fullName || "Unknown",
    ])
  );

  const messages = docs.map((d) => {
    const doc = d as { userId?: string };
    const base = {
      role: d.role as "user" | "assistant" | "system",
      content: d.content,
      createdAt: d.createdAt?.toISOString?.() ?? new Date().toISOString(),
      responseTimeSeconds: d.responseTimeSeconds,
      ...(doc.userId && d.role === "user" && {
        userId: doc.userId,
        userName: userMap.get(doc.userId) ?? "Unknown",
      }),
    };
    const m = d as { metadata?: QuestionnaireMetadata & { requestQuestionnaire?: string } };
    if (m.metadata?.type === "questionnaire") {
      return { ...base, questionnaireMetadata: m.metadata };
    }
    if (m.metadata?.requestQuestionnaire) {
      return { ...base, requestQuestionnaire: m.metadata.requestQuestionnaire as ChatMessage["requestQuestionnaire"] };
    }
    return base;
  });

  const assistantIndices = docs
    .map((d, i) => (d.role === "assistant" ? i : -1))
    .filter((i) => i >= 0);
  if (assistantIndices.length > 0) {
    const pairs = assistantIndices.map((i) => ({
      userMessage: docs[i - 1]?.content ?? "",
      assistantMessage: docs[i]?.content ?? "",
    }));
    const feedbackDocs = await ChatFeedbackModel.find({
      projectId: projectIdObj,
      userId,
      $or: pairs.map((p) => ({
        userMessage: p.userMessage,
        assistantMessage: p.assistantMessage,
      })),
    })
      .select("userMessage assistantMessage feedbackType")
      .lean();
    const feedbackMap = new Map(
      feedbackDocs.map((f) => [`${f.userMessage}\0${f.assistantMessage}`, f.feedbackType])
    );
    for (const i of assistantIndices) {
      const userContent = docs[i - 1]?.content ?? "";
      const assistantContent = docs[i]?.content ?? "";
      const key = `${userContent}\0${assistantContent}`;
      const ft = feedbackMap.get(key);
      if (ft) {
        (messages[i] as ChatMessage).feedbackType = ft as "positive" | "negative";
      }
    }
  }

  return messages;
}

export type QuestionnaireCompletionInput = {
  title: string;
  items: { label: string; completed: boolean }[];
  /** Optional AI follow-up message (created after questionnaire so it appears second) */
  followUpContent?: string;
  /** Optional image URL to show (e.g. logo preview for logo completion) */
  imageUrl?: string;
};

export async function addQuestionnaireCompletion(
  projectId: string,
  userId: string,
  input: QuestionnaireCompletionInput
): Promise<void> {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("Project not found");
  await ensureUserCanEditProject(userId, project);

  const projectIdObj = new mongoose.Types.ObjectId(projectId);
  const metadata: QuestionnaireMetadata & { imageUrl?: string } = {
    type: "questionnaire",
    title: input.title,
    items: input.items.map((item) => ({
      label: item.label,
      completed: item.completed ?? true,
    })),
    ...(input.imageUrl?.trim() && { imageUrl: input.imageUrl.trim() }),
  };

  // Questionnaire card first (so it appears before the AI answer)
  await ProjectChatMessageModel.create({
    projectId: projectIdObj,
    role: "assistant",
    content: `${metadata.title} completed`,
    metadata,
  });
  emitChatAssistant(projectId, {
    content: `${metadata.title} completed`,
    createdAt: new Date().toISOString(),
    questionnaireMetadata: metadata,
  });

  const { logProjectChange } = await import("./projectHistoryService");
  logProjectChange(projectId, userId, `Completed: ${input.title}`, "chat");

  if (input.followUpContent?.trim()) {
    await ProjectChatMessageModel.create({
      projectId: projectIdObj,
      role: "assistant",
      content: input.followUpContent.trim(),
    });
    emitChatAssistant(projectId, {
      content: input.followUpContent.trim(),
      createdAt: new Date().toISOString(),
    });
  }
}
