/**
 * Detects if the user is asking to update project details via chat.
 * Returns the questionnaire type to show, or null if no match.
 */
export type RequestedQuestionnaire =
  | "description"
  | "logo"
  | "socials"
  | "audit-kyc"
  | "listing-platforms"
  | "tokenomics"
  | "roadmap"
  | "faq"
  | "team"
  | "token"
  | "token-address"
  | "token-name-symbol"
  | "token-features";

const DESCRIPTION_PATTERNS = [
  /\b(update|change|modify|edit|set)\s+(the\s+)?(project\s+)?(token\s+)?(another\s+)?description\b/i,
  /\b(update|change|modify|edit)\s+(the\s+)?(token\s+)?(another\s+)?description\b/i,
  /\b(new|different|another)\s+(token\s+)?description\b/i,
  /\bdescription\s+(update|change)\b/i,
  /\bI\s+want\s+(to\s+)?(update|change)\s+(the\s+)?(token\s+)?(another\s+)?description\b/i,
  /\bI\s+want\s+(a\s+)?(another\s+)?(new\s+)?(different\s+)?description\b/i,
  // Common typo: "descritpion"
  /\bI\s+want\s+to\s+update\s+(the\s+)?(token\s+)?descritpion\b/i,
  /\b(update|change|modify|edit)\s+(the\s+)?(token\s+)?descritpion\b/i,
  // Short intents: "description", "the description", "project description" (when clearly asking to update)
  /^\s*description\s*$/i,
  /^\s*(the\s+)?(project\s+)?(token\s+)?description\s*(please|pls)?\s*$/i,
];

const LOGO_PATTERNS = [
  /\b(update|change|modify|edit|set|upload)\s+(the\s+)?(project\s+)?(token\s+)?(another\s+)?logo\b/i,
  /\b(update|change|modify|edit|upload)\s+(the\s+)?(token\s+)?(another\s+)?logo\b/i,
  /\b(new|different|another)\s+(token\s+)?logo\b/i,
  /\blogo\s+(update|change|upload)\b/i,
  /\bI\s+want\s+to\s+(update|change|upload)\s+(the\s+)?(token\s+)?(another\s+)?logo\b/i,
  /\bupload\s+(a\s+)?(new\s+)?(different\s+)?(another\s+)?logo\b/i,
  // Short intents
  /^\s*logo\s*$/i,
  /^\s*(the\s+)?(project\s+)?(token\s+)?logo\s*(please|pls)?\s*$/i,
];

const TOKEN_ADDRESS_PATTERNS = [
  /\b(update|change|modify|edit)\s+(the\s+)?(token\s+)?address\b/i,
  /\b(update|change)\s+(token\s+)?(contract\s+)?address\b/i,
  /\b(update|change)\s+(the\s+)?blockchain\b/i,
  /\b(update|change)\s+(the\s+)?chain\b/i,
  /\bI\s+want\s+to\s+(update|change)\s+(the\s+)?(blockchain|address|chain)\b/i,
  /\bnew\s+(token\s+)?address\b/i,
  /\bdifferent\s+(token\s+)?address\b/i,
  // Short intents
  /^\s*(token\s+)?address\s*(please|pls)?\s*$/i,
  /^\s*(the\s+)?blockchain\s*$/i,
  /^\s*(the\s+)?chain\s*$/i,
];

const TOKEN_NAME_SYMBOL_PATTERNS = [
  /\b(update|change|modify|edit)\s+(the\s+)?(token\s+)?name\b/i,
  /\b(update|change|modify|edit)\s+(the\s+)?symbol\b/i,
  /\b(update|change)\s+token\s+name\b/i,
  /\b(update|change)\s+token\s+symbol\b/i,
  /\bnew\s+(token\s+)?(name|symbol)\b/i,
  // Short intents
  /^\s*(token\s+)?(name|symbol)\s*(please|pls)?\s*$/i,
];

const TOKEN_GENERAL_PATTERNS = [
  /\b(update|change|modify|edit)\s+(the\s+)?token\s+details\b/i,
  /\b(update|change)\s+token\s+(info|information)\b/i,
  /\bI\s+want\s+to\s+(update|change)\s+(my\s+)?token\b/i,
  // Short intents
  /^\s*token\s*$/i,
  /^\s*(token\s+)?(details|info)\s*(please|pls)?\s*$/i,
];

const SOCIALS_PATTERNS = [
  /\b(update|change|modify|edit|set|add)\s+(the\s+)?(social\s+)?(links?)\b/i,
  /\b(update|change|modify|edit)\s+(the\s+)?(links?)\b/i,
  /\b(social\s+)?(links?)\s+(update|change|modify|edit)\b/i,
  /\b(x|twitter|telegram|discord|github|youtube|whitepaper)\s+(link|url)\b/i,
  /\badd\s+(my\s+)?(social|links?)\b/i,
  /\bI\s+want\s+to\s+(update|change|add)\s+(my\s+)?(social\s+)?(links?)\b/i,
  // "add whitepaper", "add youtube channel", "add telegram", etc.
  /\b(add|include|upload)\s+(the\s+)?(a\s+)?(whitepaper)\b/i,
  /\b(add|include)\s+(the\s+)?(a\s+)?(youtube)\s*(channel)?\b/i,
  /\b(add|include)\s+(the\s+)?(a\s+)?(telegram)\s*(group|channel)?\b/i,
  /\b(add|include)\s+(the\s+)?(a\s+)?(discord)\s*(server)?\b/i,
  /\b(add|include)\s+(the\s+)?(a\s+)?(github)\b/i,
  /\b(add|include)\s+(the\s+)?(a\s+)?(x|twitter)\b/i,
  /\b(add|include)\s+(the\s+)?(an?\s+)?(external\s+)?link\b/i,
  /\bI\s+want\s+to\s+add\s+(the\s+)?(a\s+)?(whitepaper)\b/i,
  /\bI\s+want\s+to\s+add\s+(the\s+)?(a\s+)?(youtube)\s*(channel)?\b/i,
  /\bI\s+want\s+to\s+add\s+(the\s+)?(a\s+)?(telegram)\s*(group|channel)?\b/i,
  /\bI\s+want\s+to\s+add\s+(the\s+)?(a\s+)?(discord)\s*(server)?\b/i,
  /\bI\s+want\s+to\s+add\s+(the\s+)?(a\s+)?(github)\b/i,
  /\bI\s+want\s+to\s+add\s+(the\s+)?(a\s+)?(x|twitter)\b/i,
  /\bI\s+want\s+to\s+add\s+(an?\s+)?(external\s+)?link\b/i,
  // "want to add youtube", "want whitepaper" (shorter)
  /\bwant\s+to\s+add\s+(youtube|telegram|discord|github|whitepaper|x|twitter)\b/i,
  // Short intents: "whitepaper", "youtube", "telegram", etc.
  /^\s*(add\s+)?(whitepaper)\s*$/i,
  /^\s*(add\s+)?(youtube)\s*(channel)?\s*$/i,
  /^\s*(add\s+)?(telegram)\s*(group|channel)?\s*$/i,
  /^\s*(add\s+)?(discord)\s*(server)?\s*$/i,
  /^\s*(add\s+)?(github)\s*$/i,
  /^\s*(add\s+)?(x|twitter)\s*$/i,
  /^\s*(social\s+)?(links?)\s*(please|pls)?\s*$/i,
];

const AUDIT_KYC_PATTERNS = [
  /\b(update|change|modify|edit|set|add)\s+(the\s+)?(audit|kyc)\b/i,
  /\b(update|change|add)\s+(audit|kyc)\s+(info|information|provider|report|link)\b/i,
  /\b(audit|kyc)\s+(update|change|add|provider|report|link)\b/i,
  /\badd\s+(audit|kyc)\s+(report|info|information)\b/i,
  /\bI\s+want\s+to\s+(add|update|change)\s+(audit|kyc)\b/i,
  /\b(add|include)\s+(the\s+)?(an?\s+)?(audit|kyc)\b/i,
  /^\s*(add\s+)?(audit)\s*$/i,
  /^\s*(add\s+)?(kyc)\s*$/i,
  /^\s*(audit|kyc)\s+(please|pls)?\s*$/i,
];

const TOKENOMICS_PATTERNS = [
  /\b(update|change|modify|edit|add|set)\s+(the\s+)?tokenomics\b/i,
  /\btokenomics\s+(update|change|add|setup)\b/i,
  /\badd\s+tokenomics\b/i,
  /\bsetup\s+tokenomics\b/i,
  /\bconfigure\s+tokenomics\b/i,
  /\b(update|change)\s+(the\s+)?(token\s+)?(allocation|distribution)\b/i,
  /\b(total\s+)?supply\s+(and\s+)?allocations?\b/i,
  /^\s*add\s+tokenomics\s*$/i,
  /^\s*tokenomics\s*(please|pls)?\s*$/i,
];

const FAQ_PATTERNS = [
  /\b(update|change|modify|edit|add|set)\s+(the\s+)?faq\b/i,
  /\bfaq\s+(update|change|add|setup)\b/i,
  /\badd\s+faq\b/i,
  /\bsetup\s+faq\b/i,
  /\b(frequently\s+asked\s+)?questions?\b/i,
  /^\s*add\s+faq\s*$/i,
  /^\s*faq\s*(please|pls)?\s*$/i,
];

const ROADMAP_PATTERNS = [
  /\b(update|change|modify|edit|add|set)\s+(the\s+)?roadmap\b/i,
  /\broadmap\s+(update|change|add|setup)\b/i,
  /\badd\s+roadmap\b/i,
  /\bsetup\s+roadmap\b/i,
  /\bconfigure\s+roadmap\b/i,
  /\b(phases?|milestones?)\s+(update|change|add)\b/i,
  /^\s*add\s+roadmap\s*$/i,
  /^\s*roadmap\s*(please|pls)?\s*$/i,
];

const TEAM_PATTERNS = [
  /\b(update|change|modify|edit|add|set)\s+(the\s+)?team\b/i,
  /\bteam\s+(update|change|add|setup)\b/i,
  /\badd\s+team\b/i,
  /\bsetup\s+team\b/i,
  /\bteam\s+members?\b/i,
  /\badd\s+team\s+members?\b/i,
  /^\s*add\s+team\s*$/i,
  /^\s*team\s*(please|pls)?\s*$/i,
];

const LISTING_PLATFORMS_PATTERNS = [
  /\b(update|change|modify|edit|add)\s+(the\s+)?(listing\s+)?(vote\s+)?platforms?\b/i,
  /\b(listing|vote)\s+(platforms?)\s+(update|change|add)\b/i,
  /\badd\s+(listing|vote)\s+(platforms?)\b/i,
  /\b(listing|vote)\s+(platforms?)\b/i,
  /^\s*(add\s+)?(listing\s+)?platforms?\s*$/i,
  /^\s*(listing\s+)?platforms?\s*(please|pls)?\s*$/i,
];

const TOKEN_FEATURES_PATTERNS = [
  /\b(update|change|modify|edit|set)\s+(the\s+)?(token\s+)?features\b/i,
  /\b(update|change|modify|edit)\s+(the\s+)?(token\s+)?(security\s+)?(features|details)\b/i,
  /\b(token\s+)?features\s+(update|change|modify|edit)\b/i,
  /\bliquidity\s+locked\b/i,
  /\bcontract\s+renounced\b/i,
  /\bburn\s+mechanism\b/i,
  /\bstaking\s+rewards\b/i,
  /\bteam\s+vesting\b/i,
  /\btransaction\s+(tax|taxes)\b/i,
  /\bmint\s+authority\b/i,
  /\bfreeze\s+authority\b/i,
  /\bupdate\s+authority\b/i,
  /\b(update|change)\s+(liquidity|contract|burn|staking|vesting|tax)\b/i,
  /\bI\s+want\s+to\s+(update|change|set)\s+(the\s+)?(token\s+)?features\b/i,
  // Short intents
  /^\s*(token\s+)?features\s*(please|pls)?\s*$/i,
  /^\s*security\s+features\s*$/i,
];

const AFFIRMATIVE_PATTERNS = [
  /^\s*(yes|yeah|yep|sure|ok|okay)\s*\.?\s*$/i,
  /^\s*yes\s+(please|pls)(\s+update)?\s*\.?\s*$/i,
  /^\s*yes\s+update\s*\.?\s*$/i,
  /^\s*(please|pls)\s+(do|update)\s*\.?\s*$/i,
  /^\s*(go\s+ahead|do\s+it)\s*\.?\s*$/i,
  /^\s*please\s*\.?\s*$/i,
];

/** "Update it", "change it", "yes I want to update it" – refers to the thing we just discussed */
const UPDATE_IT_PATTERNS = [
  /\b(update|change|modify|edit)\s+it\b/i,
  /\byes\s+(I\s+)?(want\s+to\s+)?(update|change|modify)\s+it\b/i,
  /\b(I\s+)?(want\s+to\s+)?(update|change|modify)\s+it\b/i,
  /\b(please\s+)?(update|change)\s+it\b/i,
];

function isAffirmativeOrUpdateIt(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  return (
    AFFIRMATIVE_PATTERNS.some((p) => p.test(trimmed)) ||
    UPDATE_IT_PATTERNS.some((p) => p.test(trimmed))
  );
}

function inferQuestionnaireFromContext(
  userMessage: string,
  lastAssistantMessage: string
): RequestedQuestionnaire | null {
  if (!isAffirmativeOrUpdateIt(userMessage)) return null;
  const lower = lastAssistantMessage.toLowerCase();
  if (/\bdescription\b/.test(lower) && /\b(update|modify|change)\b/.test(lower)) {
    return "description";
  }
  if (/\blogo\b/.test(lower) && /\b(update|modify|change)\b/.test(lower)) {
    return "logo";
  }
  if (/\btoken\b/.test(lower) && /\b(update|modify|change|details)\b/.test(lower)) {
    return "token";
  }
  if (/\b(token\s+)?features\b/.test(lower) || /\bsecurity\b/.test(lower)) {
    return "token-features";
  }
  if (/\b(social\s+)?(links?)\b/.test(lower)) {
    return "socials";
  }
  if (/\b(audit|kyc)\b/.test(lower)) {
    return "audit-kyc";
  }
  if (/\b(listing|vote)\s*platforms?\b/.test(lower)) {
    return "listing-platforms";
  }
  if (/\btokenomics\b/.test(lower) || /\ballocations?\b/.test(lower)) {
    return "tokenomics";
  }
  if (/\broadmap\b/.test(lower) || /\bphases?\b/.test(lower) || /\bmilestones?\b/.test(lower)) {
    return "roadmap";
  }
  if (/\bfaq\b/.test(lower) || /\bfrequently\s+asked\b/.test(lower) || /\bquestions?\b/.test(lower)) {
    return "faq";
  }
  if (/\bteam\b/.test(lower) || /\bteam\s+members?\b/.test(lower)) {
    return "team";
  }
  return null;
}

export function detectQuestionnaireRequest(
  message: string,
  lastAssistantMessage?: string | null
): RequestedQuestionnaire | null {
  const trimmed = message.trim();
  if (!trimmed) return null;

  // If no direct match, check affirmative response to prior offer (e.g. "yes please" after "want to update description?")
  if (lastAssistantMessage?.trim()) {
    const fromContext = inferQuestionnaireFromContext(trimmed, lastAssistantMessage);
    if (fromContext) return fromContext;
  }

  // Check more specific patterns first
  if (TOKEN_FEATURES_PATTERNS.some((p) => p.test(trimmed))) {
    return "token-features";
  }
  if (TOKEN_ADDRESS_PATTERNS.some((p) => p.test(trimmed))) {
    return "token-address";
  }
  if (TOKEN_NAME_SYMBOL_PATTERNS.some((p) => p.test(trimmed))) {
    return "token-name-symbol";
  }
  if (DESCRIPTION_PATTERNS.some((p) => p.test(trimmed))) {
    return "description";
  }
  if (SOCIALS_PATTERNS.some((p) => p.test(trimmed))) {
    return "socials";
  }
  if (AUDIT_KYC_PATTERNS.some((p) => p.test(trimmed))) {
    return "audit-kyc";
  }
  if (LISTING_PLATFORMS_PATTERNS.some((p) => p.test(trimmed))) {
    return "listing-platforms";
  }
  if (TOKENOMICS_PATTERNS.some((p) => p.test(trimmed))) {
    return "tokenomics";
  }
  if (ROADMAP_PATTERNS.some((p) => p.test(trimmed))) {
    return "roadmap";
  }
  if (FAQ_PATTERNS.some((p) => p.test(trimmed))) {
    return "faq";
  }
  if (TEAM_PATTERNS.some((p) => p.test(trimmed))) {
    return "team";
  }
  if (LOGO_PATTERNS.some((p) => p.test(trimmed))) {
    return "logo";
  }
  if (TOKEN_GENERAL_PATTERNS.some((p) => p.test(trimmed))) {
    return "token";
  }

  return null;
}
