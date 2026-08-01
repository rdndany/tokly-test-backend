import { createHmac, timingSafeEqual } from "crypto";
import type { PartnerCreatePayload } from "../types/partnerCreate";

export function encodePartnerCreatePayload(payload: PartnerCreatePayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodePartnerCreatePayload(encoded: string): PartnerCreatePayload {
  const json = Buffer.from(encoded, "base64url").toString("utf8");
  return JSON.parse(json) as PartnerCreatePayload;
}

export function signPartnerCreatePayload(encoded: string, secret: string): string {
  return createHmac("sha256", secret).update(encoded).digest("hex");
}

export function verifyPartnerCreatePayload(
  encoded: string,
  signature: string,
  secret: string
): { ok: true; payload: PartnerCreatePayload } | { ok: false; error: string } {
  if (!secret) return { ok: false, error: "Partner secret is not configured" };
  if (!encoded?.trim()) return { ok: false, error: "Missing payload" };
  if (!signature?.trim()) return { ok: false, error: "Missing signature" };

  const expected = signPartnerCreatePayload(encoded, secret);
  try {
    const a = Buffer.from(signature, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, error: "Invalid signature" };
    }
  } catch {
    return { ok: false, error: "Invalid signature format" };
  }

  try {
    const payload = decodePartnerCreatePayload(encoded);
    const err = validatePartnerCreatePayload(payload);
    if (err) return { ok: false, error: err };
    return { ok: true, payload };
  } catch {
    return { ok: false, error: "Invalid payload encoding" };
  }
}

export function validatePartnerCreatePayload(payload: PartnerCreatePayload): string | null {
  const token = payload.token;
  if (!token) return "Missing token object";

  const hasNameSymbol =
    Boolean(token.name?.trim()) && Boolean(token.symbol?.trim());
  const hasAddressChain =
    Boolean(token.address?.trim()) && Boolean(token.chain?.trim());

  if (!hasNameSymbol && !hasAddressChain) {
    return "Provide token.name + token.symbol, or token.address + token.chain";
  }

  if (!hasAddressChain && !token.description?.trim()) {
    return "token.description is required when not using address + chain";
  }

  return null;
}
