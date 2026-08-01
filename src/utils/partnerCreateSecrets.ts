/** Lowercase partner id from payload JSON, e.g. "coinsniper", "dexscreener". */
const PARTNER_ID_PATTERN = /^[a-z0-9_-]{2,40}$/;

export function normalizePartnerId(partner?: string): string {
  return partner?.trim().toLowerCase() ?? "";
}

export function isValidPartnerId(partner?: string): boolean {
  const id = normalizePartnerId(partner);
  return Boolean(id && PARTNER_ID_PATTERN.test(id));
}

/** Env var name for a partner signing secret, e.g. coinsniper → COINSNIPER_SECRET_KEY. */
export function getPartnerSecretEnvVar(partnerId: string): string {
  return `${normalizePartnerId(partnerId).toUpperCase().replace(/[^A-Z0-9]/g, "_")}_SECRET_KEY`;
}

export function getPartnerCreateSecret(partner?: string): string {
  const id = normalizePartnerId(partner);
  if (!isValidPartnerId(id)) return "";
  return process.env[getPartnerSecretEnvVar(id)]?.trim() ?? "";
}
