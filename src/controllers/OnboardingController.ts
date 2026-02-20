import { Request, Response } from "express";
import { createLogger } from "../utils/logger";

const logger = createLogger("OnboardingController");
import {
  checkHandleAvailability,
  completeOnboarding as completeOnboardingService,
  HANDLE_REGEX,
} from "../services/onboardingService";

export async function checkHandle(req: Request, res: Response): Promise<void> {
  const raw = (req.query.handle as string) ?? "";
  const handle = raw.trim().toLowerCase();
  if (!handle) {
    res.status(400).json({ available: false, message: "Handle is required" });
    return;
  }
  if (!HANDLE_REGEX.test(handle)) {
    res.status(200).json({
      available: false,
      message:
        "Handle must be 3–30 characters, letters, numbers, and underscores only",
    });
    return;
  }
  try {
    const currentUserId = req.auth?.userId ?? undefined;
    logger.debug("[checkHandle controller] raw query handle:", JSON.stringify(raw), "handle:", JSON.stringify(handle), "req.auth?.userId:", req.auth?.userId ?? "(none)");
    const result = await checkHandleAvailability(handle, currentUserId);
    res.status(200).json(result);
  } catch (error) {
    logger.error("Check handle error:", error);
    res.status(500).json({ available: false, message: "Could not check handle" });
  }
}

export async function completeOnboarding(
  req: Request,
  res: Response
): Promise<void> {
  if (!req.auth?.userId) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  const userId = req.auth.userId;
  const body = req.body as {
    fullName?: string;
    companyRole?: string;
    companySize?: string;
    theme?: "light" | "dark" | "system";
    handle?: string;
    autoAcceptInvitations?: boolean;
  };

  const fullName =
    typeof body.fullName === "string" ? body.fullName.trim() : undefined;
  const companyRole =
    typeof body.companyRole === "string" ? body.companyRole.trim() : undefined;
  const companySize =
    typeof body.companySize === "string" ? body.companySize.trim() : undefined;
  const theme =
    typeof body.theme === "string" &&
    ["light", "dark", "system"].includes(body.theme)
      ? body.theme
      : undefined;
  const rawHandle =
    typeof body.handle === "string" ? body.handle.trim() : undefined;
  const handle = rawHandle ? rawHandle.toLowerCase() : undefined;
  const autoAcceptInvitations =
    typeof body.autoAcceptInvitations === "boolean" ? body.autoAcceptInvitations : undefined;

  try {
    await completeOnboardingService(userId, {
      fullName,
      companyRole,
      companySize,
      theme,
      handle,
      autoAcceptInvitations,
    });
    res.status(200).json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save onboarding";
    const status =
      message === "Invalid handle format" || message === "This handle is already taken"
        ? 400
        : 500;
    logger.error("Onboarding complete error:", error);
    res.status(status).json({ success: false, message });
  }
}
