import { chromium } from "playwright";
import { createLogger } from "../utils/logger";

const logger = createLogger("ScreenshotService");

/** Build the published project page URL from subdomain + domain (e.g. https://global.toklyproject.site) */
function getPublishedPageUrl(subdomain: string, domain: string): string {
  const s = subdomain.trim().toLowerCase();
  const d = domain.trim().toLowerCase();
  if (!s || !d || !/^[a-z0-9-]+$/.test(s)) return "";
  return `https://${s}.${d}`;
}

/** Viewport for thumbnail: visible part only (nav + hero), no scroll. OG standard 1200x630. */
const THUMBNAIL_VIEWPORT = { width: 1200, height: 630 };

/** Capture a screenshot of a URL and return PNG buffer. Returns null on failure. */
export async function capturePageScreenshot(
  url: string,
  viewport = THUMBNAIL_VIEWPORT
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
    // Hide elements marked for screenshot exclusion (e.g. Edit with Tokly badge)
    await page.evaluate(() => {
      document.querySelectorAll("[data-tokly-screenshot-exclude]").forEach((el) => {
        (el as HTMLElement).style.setProperty("display", "none", "important");
      });
    });
    const buffer = await page.screenshot({
      type: "png",
      fullPage: true,
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
    logger.warn("Cannot capture thumbnail: invalid subdomain or domain");
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
