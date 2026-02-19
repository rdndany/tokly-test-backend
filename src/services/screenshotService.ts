import { chromium } from "playwright";
import config from "../config";
import { createLogger } from "../utils/logger";

const logger = createLogger("ScreenshotService");

/** Build the published project page URL for a given subdomain/domain */
function getPublishedPageUrl(subdomain: string, domain: string): string {
  const appUrl = (config.app?.url ?? "").replace(/\/$/, "");
  if (!appUrl) return "";
  const params = new URLSearchParams({
    domain: domain.trim().toLowerCase(),
  });
  return `${appUrl}/project/${encodeURIComponent(subdomain.trim().toLowerCase())}?${params.toString()}`;
}

/** Capture a screenshot of a URL and return PNG buffer. Returns null on failure. */
export async function capturePageScreenshot(
  url: string,
  viewport = { width: 1280, height: 720 }
): Promise<Buffer | null> {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setViewportSize(viewport);
    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 15000,
    });
    // Small delay for any late-rendering content (e.g. fonts)
    await new Promise((r) => setTimeout(r, 500));
    const buffer = await page.screenshot({
      type: "png",
      fullPage: false,
    });
    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  } catch (err) {
    logger.error("Screenshot capture failed:", err);
    return null;
  } finally {
    await browser?.close();
  }
}

/** Capture screenshot of published project and upload to S3. Updates project.thumbnailUrl. */
export async function captureAndUploadProjectThumbnail(
  projectId: string,
  subdomain: string,
  domain: string
): Promise<void> {
  const url = getPublishedPageUrl(subdomain, domain);
  if (!url) {
    logger.warn("Cannot capture thumbnail: APP_URL not configured");
    return;
  }

  const buffer = await capturePageScreenshot(url);
  if (!buffer) return;

    const { UploadService } = await import("./uploadService");
    const ProjectModel = (await import("../models/Project")).default;
  const { v4: uuidv4 } = await import("uuid");

  try {
    const fileKey = `thumbnails/projects/${projectId}/${uuidv4()}.png`;
    const publicUrl = await UploadService.uploadBuffer(
      fileKey,
      buffer,
      "image/png"
    );

    await ProjectModel.updateOne(
      { _id: projectId },
      { $set: { thumbnailUrl: publicUrl } }
    );
    logger.info("Thumbnail captured and saved for project", projectId);
  } catch (err) {
    logger.error("Thumbnail upload failed for project", projectId, err);
  }
}
