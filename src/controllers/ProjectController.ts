import mongoose from "mongoose";
import { Request, Response } from "express";
import { clerkClient } from "@clerk/express";
import { createLogger } from "../utils/logger";
import { sendProjectCreateMail } from "../services/emailService";
import config from "../config";

const logger = createLogger("ProjectController");
import {
  createProject as createProjectService,
  deleteProject as deleteProjectService,
  ensureUserCanEditProject as ensureUserCanEditProjectService,
  generateHeroTextForProject as generateHeroTextForProjectService,
  getProjectById,
  getTokenPreview as getTokenPreviewService,
  listProjectsByUser,
  starProject as starProjectService,
  unstarProject as unstarProjectService,
  updateProjectTitle as updateProjectTitleService,
  updateProjectCategory as updateProjectCategoryService,
  updateProjectVisibility as updateProjectVisibilityService,
  updateProjectSeo as updateProjectSeoService,
  getProjectByPublishUrl as getProjectByPublishUrlService,
  getProjectByDomain as getProjectByDomainService,
  checkPublishUrlAvailability as checkPublishUrlAvailabilityService,
  updateProjectCustomDomain as updateProjectCustomDomainService,
  updateProjectPublishAddress as updateProjectPublishAddressService,
  unpublishProject as unpublishProjectService,
  transferProject as transferProjectService,
  updateProjectTokenDetails as updateTokenDetailsService,
  updateProjectTokenDetailsByNameSymbol as updateTokenDetailsByNameSymbolService,
  updateProjectLaunchDetails as updateLaunchDetailsService,
  updateProjectTokenLogo as updateTokenLogoService,
  updateProjectDexUrl as updateDexUrlService,
  updateProjectTokenDescription as updateTokenDescriptionService,
  updateProjectTokenFeatures as updateTokenFeaturesService,
  updateProjectSocialLinks as updateSocialLinksService,
  updateProjectTemplate as updateTemplateService,
  updateProjectSectionVisibility as updateSectionVisibilityService,
  updateProjectSectionLayout as updateSectionLayoutService,
  updateWhitelistSectionContent as updateWhitelistSectionContentService,
  updateAirdropSectionContent as updateAirdropSectionContentService,
  updateProjectAirdropConfig as updateProjectAirdropConfigService,
  updateProjectTokenomics as updateTokenomicsService,
  updateProjectRoadmap as updateRoadmapService,
  updateProjectFAQ as updateFAQService,
  updateProjectTeam as updateTeamService,
  updateProjectAuditKyc as updateAuditKycService,
  updateProjectListingPlatforms as updateListingPlatformsService,
  updateHideToklyBadge as updateHideToklyBadgeService,
  updateAnalyticsDisabled as updateAnalyticsDisabledService,
  captureProjectThumbnail as captureProjectThumbnailService,
} from "../services/projectService";
import { VercelService } from "../services/vercelService";
import { getProjectHistory as getProjectHistoryService } from "../services/projectHistoryService";
import StarredProjectModel from "../models/StarredProject";
import UserModel from "../models/User";
import { removeProjectFromFolder } from "../services/projectFolderService";
import { sendMessage as sendChatMessage } from "../services/chatService";
import { requireCredits } from "../services/creditsService";
import {
  getOrCreateDefaultWorkspace,
  ensureUserCanAccessWorkspace,
  getWorkspacePlanStatus,
  listWorkspacesByUser,
} from "../services/workspaceService";
import { isPaidPlan } from "../config/plans";

export async function listProjects(req: Request, res: Response): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const starredOnly = req.query.starred === "true";
  const sharedWithMe = req.query.sharedWithMe === "true";
  const allWorkspaces = req.query.allWorkspaces === "true";
  const folderId =
    typeof req.query.folderId === "string" ? req.query.folderId : undefined;
  let workspaceId =
    typeof req.query.workspaceId === "string" ? req.query.workspaceId : undefined;
  if (!workspaceId && !sharedWithMe && !allWorkspaces) {
    const workspaces = await listWorkspacesByUser(userId);
    if (workspaces.length > 0) {
      workspaceId = workspaces[0].id;
    } else {
      const defaultWs = await getOrCreateDefaultWorkspace(userId);
      workspaceId = defaultWs.id;
    }
  } else if (workspaceId) {
    const canAccess = await ensureUserCanAccessWorkspace(userId, workspaceId);
    if (!canAccess) {
      res.status(403).json({ error: "Access denied to this workspace" });
      return;
    }
  }
  try {
    const projects = await listProjectsByUser(userId, {
      starredOnly,
      sharedWithMe,
      allWorkspaces,
      workspaceId,
      folderId,
    });
    res.status(200).json({ projects });
  } catch (error) {
    logger.error("List projects error:", error);
    res.status(500).json({ error: "Failed to list projects" });
  }
}

export async function starProject(req: Request, res: Response): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  try {
    await starProjectService(userId, projectId);
    res.status(204).send();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to star";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function unstarProject(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  try {
    await unstarProjectService(userId, projectId);
    res.status(204).send();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to unstar";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function deleteProject(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  try {
    await deleteProjectService(userId, projectId);
    res.status(204).send();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to delete";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function removeProjectFromFolderHandler(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  try {
    await removeProjectFromFolder(userId, projectId);
    res.status(204).send();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to remove from folder";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function getTokenPreview(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  const address =
    typeof req.query?.address === "string" ? req.query.address.trim() : "";
  const chain =
    typeof req.query?.chain === "string" ? req.query.chain.trim() : "";
  if (!projectId || !address || !chain) {
    res.status(400).json({
      error: "Project ID, address, and chain are required",
    });
    return;
  }
  try {
    const preview = await getTokenPreviewService(
      userId,
      projectId,
      address,
      chain
    );
    if (!preview) {
      res.status(404).json({ error: "Token not found or failed to fetch" });
      return;
    }
    res.status(200).json(preview);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to fetch token preview";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function updateProjectTitle(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const title =
    typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (!title) {
    res.status(400).json({ error: "Title is required" });
    return;
  }
  try {
    const project = await updateProjectTitleService(userId, projectId, {
      title,
    });
    res.status(200).json(project);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to update project title";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function updateProjectCategory(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const category =
    typeof req.body?.category === "string" ? req.body.category.trim() : "";
  try {
    const project = await updateProjectCategoryService(userId, projectId, {
      category,
    });
    res.status(200).json(project);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to update project category";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function updateProjectVisibility(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const projectVisibility =
    req.body?.projectVisibility === "public" ? "public" : "workspace";
  try {
    const project = await updateProjectVisibilityService(userId, projectId, {
      projectVisibility,
    });
    res.status(200).json(project);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to update project visibility";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function updateProjectSeo(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const body = req.body || {};
  const input: { favicon?: string | null; seoTitle?: string | null; seoDescription?: string | null; ogImage?: string | null } = {};
  if ("favicon" in body) input.favicon = body.favicon === null ? null : (typeof body.favicon === "string" ? body.favicon.trim() || null : null);
  if ("seoTitle" in body) input.seoTitle = body.seoTitle === null ? null : (typeof body.seoTitle === "string" ? body.seoTitle.trim().slice(0, 60) || null : null);
  if ("seoDescription" in body) input.seoDescription = body.seoDescription === null ? null : (typeof body.seoDescription === "string" ? body.seoDescription.trim().slice(0, 160) || null : null);
  if ("ogImage" in body) input.ogImage = body.ogImage === null ? null : (typeof body.ogImage === "string" ? body.ogImage.trim() || null : null);
  try {
    const project = await updateProjectSeoService(userId, projectId, input);
    res.status(200).json(project);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to update SEO settings";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function getProjectOgData(
  req: Request,
  res: Response
): Promise<void> {
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  try {
    const project = await getProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
    res.status(200).json(project);
  } catch (error) {
    logger.error("Get project OG data error:", error);
    res.status(500).json({ error: "Failed to load project" });
  }
}

export async function getProjectByDomain(
  req: Request,
  res: Response
): Promise<void> {
  const host = req.params.host;
  if (!host) {
    res.status(400).json({ success: false, error: "Host is required" });
    return;
  }
  try {
    const project = await getProjectByDomainService(host);
    if (!project) {
      res.status(404).json({ success: false });
      return;
    }
    res.status(200).json({
      success: true,
      project: {
        _id: project.id,
        subdomain: project.subdomain,
        domain: project.domain,
      },
    });
  } catch (error) {
    logger.error("Get project by domain error:", error);
    res.status(500).json({ success: false });
  }
}

export async function getProjectByPublishUrl(
  req: Request,
  res: Response
): Promise<void> {
  const subdomain = typeof req.query.subdomain === "string" ? req.query.subdomain : "";
  const domain = typeof req.query.domain === "string" ? req.query.domain : "";
  try {
    const project = await getProjectByPublishUrlService(subdomain, domain);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
    res.status(200).json(project);
  } catch (error) {
    logger.error("Get project by publish URL error:", error);
    res.status(500).json({ error: "Failed to load project" });
  }
}

export async function checkPublishUrlAvailability(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const subdomain = typeof req.query.subdomain === "string" ? req.query.subdomain : "";
  const domain = typeof req.query.domain === "string" ? req.query.domain : "";
  const excludeProjectId = typeof req.query.excludeProjectId === "string" ? req.query.excludeProjectId : undefined;
  try {
    const result = await checkPublishUrlAvailabilityService(subdomain, domain, excludeProjectId);
    res.status(200).json(result);
  } catch (err) {
    logger.error("Check publish URL error:", err);
    res.status(500).json({ error: "Failed to check URL availability" });
  }
}

export async function updateProjectPublishAddress(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const body = req.body || {};
  const subdomain = typeof body.subdomain === "string" ? body.subdomain : "";
  const domain = typeof body.domain === "string" ? body.domain : "";
  try {
    const project = await updateProjectPublishAddressService(userId, projectId, {
      subdomain,
      domain,
    });
    // Capture screenshot in background (do not block response)
    const { captureAndUploadProjectThumbnail } = await import(
      "../services/screenshotService"
    );
    captureAndUploadProjectThumbnail(projectId, subdomain, domain).catch(() => {
      // Logged in screenshotService
    });
    res.status(200).json(project);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to update publish address";
    const status =
      msg === "Project not found" ? 404
      : msg === "Forbidden" ? 403
      : msg === "This URL is already taken by another project" ? 409
      : msg.startsWith("Subdomain ") ? 400
      : 500;
    res.status(status).json({ error: msg });
  }
}

export async function unpublishProject(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  try {
    const project = await unpublishProjectService(userId, projectId);
    res.status(200).json(project);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to unpublish project";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function updateProjectCustomDomain(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const customDomain =
    typeof req.body?.customDomain === "string"
      ? req.body.customDomain.trim() || null
      : req.body?.customDomain === null
        ? null
        : undefined;
  if (customDomain === undefined) {
    res.status(400).json({ error: "customDomain is required (string or null to remove)" });
    return;
  }
  try {
    const project = await updateProjectCustomDomainService(userId, projectId, {
      customDomain,
    });
    res.status(200).json(project);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to update custom domain";
    const status =
      msg === "Project not found" ? 404
      : msg === "Forbidden" ? 403
      : msg?.includes("Pro plan") ? 403
      : msg?.includes("already in use") ? 409
      : 500;
    res.status(status).json({ error: msg });
  }
}

export async function getDomainSetupInfo(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  const domain = typeof req.query.domain === "string" ? req.query.domain.trim() : "";
  if (!projectId || !domain) {
    res.status(400).json({ error: "Project ID and domain query parameter are required" });
    return;
  }
  try {
    const project = await getProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await ensureUserCanEditProjectService(userId, project);

    if (VercelService.isConfigured()) {
      const result = await VercelService.getDomainSetupInfo(domain);
      res.status(200).json(result);
      return;
    }

    // Fallback when Vercel is not configured: simple CNAME to subdomain.domain
    const sub = project.subdomain ?? "";
    const dom = project.domain ?? "";
    const cnameTarget = sub && dom ? `${sub}.${dom}` : "";
    res.status(200).json({
      verified: false,
      verification: [],
      configuration: null,
      dnsSetupOptions: {
        nameservers: null,
        dnsRecords: {
          title: "Add CNAME record",
          description: "Point your domain to your project URL",
          records: cnameTarget
            ? [{ type: "CNAME", name: "@", value: cnameTarget, reason: "Project URL" }]
            : [],
          instructions: [
            "Log in to your domain registrar's DNS management panel",
            "Add a CNAME record: Name = @ or www, Value = " + (cnameTarget || "your-project-url"),
            "DNS changes can take up to 24–48 hours to propagate",
          ],
          note: "Use @ for apex domain or www for www subdomain.",
        },
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to get domain setup info";
    const status = msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function updateHideToklyBadge(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const hideToklyBadge = req.body?.hideToklyBadge === true;
  try {
    const project = await updateHideToklyBadgeService(userId, projectId, {
      hideToklyBadge,
    });
    res.status(200).json(project);
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : "Failed to update Hide Tokly badge";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function updateAnalyticsDisabled(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const analyticsDisabled = req.body?.analyticsDisabled === true;
  try {
    const project = await updateAnalyticsDisabledService(userId, projectId, {
      analyticsDisabled,
    });
    res.status(200).json(project);
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : "Failed to update analytics setting";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function captureThumbnail(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  try {
    const project = await captureProjectThumbnailService(userId, projectId);
    res.status(200).json(project);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to capture thumbnail";
    const status =
      msg === "Project not found" ? 404
      : msg === "Forbidden" ? 403
      : msg?.includes("published") ? 400
      : 500;
    res.status(status).json({ error: msg });
  }
}

export async function transferProject(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const workspaceId =
    typeof req.body?.workspaceId === "string" ? req.body.workspaceId.trim() : "";
  if (!workspaceId) {
    res.status(400).json({ error: "Target workspace is required" });
    return;
  }
  try {
    const project = await transferProjectService(userId, projectId, {
      workspaceId,
    });
    res.status(200).json(project);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to transfer project";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function getProject(req: Request, res: Response): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  try {
    const project = await getProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    let isAdmin = false;
    try {
      const userDoc = await UserModel.findById(userId).select("role").lean();
      if (userDoc?.role === "admin") isAdmin = true;
      if (!isAdmin && clerkClient) {
        const clerkUser = await clerkClient.users.getUser(userId);
        if (clerkUser.publicMetadata?.role === "admin") isAdmin = true;
      }
    } catch {
      // Ignore lookup errors; isAdmin stays false
    }
    if (!isAdmin) {
      const workspaceId = project.workspaceId?.toString();
      if (workspaceId) {
        const canAccess = await ensureUserCanAccessWorkspace(userId, workspaceId);
        if (!canAccess) {
          res.status(403).json({ error: "Forbidden" });
          return;
        }
      } else if (project.userId !== userId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }
    let response: Record<string, unknown> = { ...project };
    if (project.folderId) {
      const { getFolderPathWithIds } = await import("../services/projectFolderService");
      const folderPathSegments = await getFolderPathWithIds(project.folderId);
      response = { ...response, folderPathSegments };
    }
    const starred = await StarredProjectModel.exists({
      userId,
      projectId: new mongoose.Types.ObjectId(projectId),
    });
    response = { ...response, starred: !!starred };
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(response);
  } catch (error) {
    logger.error("Get project error:", error);
    res.status(500).json({ error: "Failed to get project" });
  }
}

export async function getProjectHistory(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const limit = Math.min(
    100,
    Math.max(10, parseInt(String(req.query?.limit || 50), 10) || 50)
  );
  try {
    const history = await getProjectHistoryService(userId, projectId, limit);
    res.status(200).json({ history });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to get project history";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function generateHeroText(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const description =
    typeof req.body?.description === "string"
      ? req.body.description.trim()
      : undefined;
  try {
    const result = await generateHeroTextForProjectService(userId, projectId, {
      ...(description && { description }),
    });
    if (!result) {
      res.status(400).json({
        error: "No description available. Add a description first.",
      });
      return;
    }
    res.status(200).json(result);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to generate hero text";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function createProject(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const prompt =
    typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt) {
    res.status(400).json({ error: "Prompt is required" });
    return;
  }

  const title =
    typeof req.body?.title === "string" ? req.body.title.trim() : undefined;

  const folderId =
    typeof req.body?.folderId === "string" ? req.body.folderId : undefined;

  let workspaceId =
    typeof req.body?.workspaceId === "string" ? req.body.workspaceId : undefined;

  if (folderId) {
    const { getFolderById } = await import("../services/projectFolderService");
    const folder = await getFolderById(folderId);
    if (!folder) {
      res.status(404).json({ error: "Folder not found" });
      return;
    }
    if (folder.type === "personal" && folder.userId !== userId) {
      res.status(403).json({ error: "Access denied to this folder" });
      return;
    }
    if (folder.type === "workspace" && folder.workspaceId) {
      const canAccess = await ensureUserCanAccessWorkspace(userId, folder.workspaceId);
      if (!canAccess) {
        res.status(403).json({ error: "Access denied to this folder" });
        return;
      }
      workspaceId = folder.workspaceId;
    } else if (folder.type === "personal") {
      if (!workspaceId) {
        const defaultWorkspace = await getOrCreateDefaultWorkspace(userId);
        workspaceId = defaultWorkspace.id;
      }
    }
  }

  if (!workspaceId) {
    const defaultWorkspace = await getOrCreateDefaultWorkspace(userId);
    workspaceId = defaultWorkspace.id;
  } else if (!folderId) {
    const canAccess = await ensureUserCanAccessWorkspace(userId, workspaceId);
    if (!canAccess) {
      res.status(403).json({ error: "Access denied to this workspace" });
      return;
    }
  }

  const planStatus = await getWorkspacePlanStatus(workspaceId);
  if (planStatus === "inactive") {
    res.status(403).json({
      error: "WORKSPACE_INACTIVE",
      message: "Your workspace is inactive. Upgrade to continue building.",
    });
    return;
  }

  // Check credits before creating project (initial AI response costs at least 0.5)
  try {
    await requireCredits(userId, 0.5, workspaceId);
  } catch (creditsErr) {
    const msg =
      creditsErr instanceof Error ? creditsErr.message : "Insufficient credits";
    const code = (creditsErr as { code?: string }).code;
    if (code === "INSUFFICIENT_CREDITS") {
      res.status(402).json({ error: msg });
      return;
    }
    throw creditsErr;
  }

  try {
    const project = await createProjectService({
      userId,
      workspaceId,
      prompt,
      title,
      folderId: folderId ?? null,
    });
    // Generate AI response in background so user can navigate and see it live
    void sendChatMessage(project.id, userId, prompt).catch((chatErr) =>
      logger.error("Initial AI response error (project still created):", chatErr)
    );
    // Send project create email in background
    void (async () => {
      try {
        const user = await clerkClient.users.getUser(userId);
        const email = user.primaryEmailAddress?.emailAddress;
        if (email) {
          const appUrl = config.app?.url || "https://tokly.io";
          const projectUrl = `${appUrl}/projects/${project.id}`;
          const creationDate = new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          });
          const userName =
            user.firstName || user.username || email.split("@")[0] || "User";
          await sendProjectCreateMail(
            email,
            userName,
            project.title || "Project",
            creationDate,
            projectUrl
          );
        }
      } catch (mailErr) {
        logger.error("Failed to send project create email:", mailErr);
      }
    })();
    res.status(201).json(project);
  } catch (error) {
    logger.error("Create project error:", error);
    res.status(500).json({ error: "Failed to create project" });
  }
}

export async function updateSocialLinks(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const body = req.body || {};
  const links = Array.isArray(body.links) ? body.links : [];
  try {
    const project = await updateSocialLinksService(userId, projectId, { links });
    res.status(200).json(project);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to update social links";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function updateTemplate(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const body = req.body || {};
  const templateId =
    typeof body.templateId === "string" ? body.templateId.trim() : "";
  const fontFamily =
    typeof body.fontFamily === "string" ? body.fontFamily.trim() : undefined;
  const colorSchemaId =
    typeof body.colorSchemaId === "string" ? body.colorSchemaId.trim() : undefined;
  try {
    const project = await updateTemplateService(userId, projectId, {
      templateId,
      fontFamily: fontFamily || undefined,
      colorSchemaId: colorSchemaId || undefined,
    });
    res.status(200).json(project);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to update template";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function updateSectionVisibility(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const body = req.body || {};
  const sectionVisibility =
    body.sectionVisibility && typeof body.sectionVisibility === "object"
      ? body.sectionVisibility
      : {};
  const sectionOrder =
    body.sectionOrder && typeof body.sectionOrder === "object"
      ? body.sectionOrder
      : undefined;

  const proSectionIds = ["whitelist", "airdrop"] as const;
  for (const sectionId of proSectionIds) {
    if (sectionVisibility[sectionId] === true) {
      try {
        const project = await getProjectById(projectId);
        if (project) {
          await ensureUserCanEditProjectService(userId, project);
          const workspaceId = project.workspaceId?.toString();
          if (workspaceId) {
            const planStatus = await getWorkspacePlanStatus(workspaceId);
            if (!isPaidPlan(planStatus)) {
              const names: Record<string, string> = { whitelist: "Whitelist", airdrop: "Airdrop" };
              res.status(403).json({
                error: `A paid plan is required to enable the ${names[sectionId]} section.`,
              });
              return;
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Forbidden";
        const status = msg === "Project not found" ? 404 : 403;
        res.status(status).json({ error: msg });
        return;
      }
    }
  }

  try {
    const project = await updateSectionVisibilityService(userId, projectId, {
      sectionVisibility,
      sectionOrder,
    });
    res.status(200).json(project);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to update section visibility";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function updateSectionLayout(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const body = req.body || {};
  const sectionId =
    typeof body.sectionId === "string" ? body.sectionId.trim() : "";
  const layoutType =
    typeof body.layoutType === "string" ? body.layoutType.trim() : "";
  if (!sectionId || !layoutType) {
    res.status(400).json({ error: "sectionId and layoutType are required" });
    return;
  }
  try {
    const project = await updateSectionLayoutService(userId, projectId, {
      sectionId,
      layoutType,
    });
    res.status(200).json(project);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to update section layout";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function updateWhitelistSectionContent(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  const customText =
    req.body?.customText === undefined
      ? undefined
      : req.body?.customText === null
        ? null
        : typeof req.body?.customText === "string"
          ? req.body.customText
          : undefined;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  if (customText === undefined) {
    res.status(400).json({ error: "customText is required (string or null)" });
    return;
  }
  try {
    const project = await updateWhitelistSectionContentService(userId, projectId, customText);
    res.status(200).json(project);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to update whitelist section content";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function updateAirdropSectionContent(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  const customText =
    req.body?.customText === undefined
      ? undefined
      : req.body?.customText === null
        ? null
        : typeof req.body?.customText === "string"
          ? req.body.customText
          : undefined;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  if (customText === undefined) {
    res.status(400).json({ error: "customText is required (string or null)" });
    return;
  }
  try {
    const project = await updateAirdropSectionContentService(userId, projectId, customText);
    res.status(200).json(project);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to update airdrop section content";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function updateTokenomics(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const body = req.body || {};
  const totalSupply =
    typeof body.totalSupply === "string" ? body.totalSupply : undefined;
  const allocations =
    Array.isArray(body.allocations) ? body.allocations : undefined;
  try {
    const project = await updateTokenomicsService(userId, projectId, {
      totalSupply,
      allocations,
    });
    res.status(200).json(project);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to update tokenomics";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function updateRoadmap(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const body = req.body || {};
  const phases = Array.isArray(body.phases) ? body.phases : undefined;
  try {
    const project = await updateRoadmapService(userId, projectId, { phases });
    res.status(200).json(project);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to update roadmap";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function updateFAQ(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const body = req.body || {};
  const faqItems = Array.isArray(body.faqItems) ? body.faqItems : undefined;
  try {
    const project = await updateFAQService(userId, projectId, { faqItems });
    res.status(200).json(project);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to update FAQ";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function updateTeam(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const body = req.body || {};
  const teamMembers = Array.isArray(body.teamMembers) ? body.teamMembers : undefined;
  try {
    const project = await updateTeamService(userId, projectId, { teamMembers });
    res.status(200).json(project);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to update team";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function updateAuditKyc(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const body = req.body || {};
  const auditProvider =
    typeof body.auditProvider === "string" ? body.auditProvider.trim() : undefined;
  const auditLink =
    typeof body.auditLink === "string" ? body.auditLink.trim() : undefined;
  const kycProvider =
    typeof body.kycProvider === "string" ? body.kycProvider.trim() : undefined;
  const kycLink =
    typeof body.kycLink === "string" ? body.kycLink.trim() : undefined;
  try {
    const project = await updateAuditKycService(userId, projectId, {
      auditProvider: auditProvider ?? "",
      auditLink: auditLink ?? "",
      kycProvider: kycProvider ?? "",
      kycLink: kycLink ?? "",
    });
    res.status(200).json(project);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to update audit/KYC";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function updateListingPlatforms(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const body = req.body || {};
  const platforms = Array.isArray(body.platforms) ? body.platforms : [];
  try {
    const project = await updateListingPlatformsService(userId, projectId, { platforms });
    res.status(200).json(project);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to update listing platforms";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

export async function updateTokenDetails(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const address =
    typeof req.body?.address === "string" ? req.body.address.trim() : "";
  const chain =
    typeof req.body?.chain === "string" ? req.body.chain.trim() : "";
  const name =
    typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const symbol =
    typeof req.body?.symbol === "string" ? req.body.symbol.trim() : "";
  const launchType =
    typeof req.body?.launchType === "string" ? req.body.launchType.trim() : "";
  const launchPlatformUrl =
    typeof req.body?.launchPlatformUrl === "string"
      ? req.body.launchPlatformUrl.trim()
      : "";

  if (address && chain) {
    const hasLogoKey = "logo" in (req.body || {});
    const logo =
      hasLogoKey && typeof req.body?.logo === "string"
        ? req.body.logo.trim()
        : undefined;
    const fromQuestionnaire =
      req.body?.fromQuestionnaire === true || req.body?._fromQuestionnaire === true;
    const fromGeneralSettings =
      req.body?.fromGeneralSettings === true;
    try {
      const project = await updateTokenDetailsService(userId, projectId, {
        address,
        chain,
        ...(hasLogoKey && { logo: logo ?? "" }),
        fromQuestionnaire,
        fromGeneralSettings,
      });
      res.status(200).json(project);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update token";
      const status =
        msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
      res.status(status).json({ error: msg });
    }
    return;
  }
  if (name && symbol) {
    const fromQuestionnaire =
      req.body?.fromQuestionnaire === true || req.body?._fromQuestionnaire === true;
    const fromGeneralSettings = req.body?.fromGeneralSettings === true;
    try {
      const project = await updateTokenDetailsByNameSymbolService(
        userId,
        projectId,
        {
          name,
          symbol,
          ...(launchType && { launchType }),
          ...(launchPlatformUrl && { launchPlatformUrl }),
          fromQuestionnaire,
          fromGeneralSettings,
        }
      );
      res.status(200).json(project);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update token";
      const status =
        msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
      res.status(status).json({ error: msg });
    }
    return;
  }
  // Launch details only (for projects with address+chain and no price)
  const hasLaunchKey =
    "launchType" in (req.body || {}) || "launchPlatformUrl" in (req.body || {});
  if (hasLaunchKey) {
    const launchType =
      typeof req.body?.launchType === "string"
        ? req.body.launchType.trim()
        : undefined;
    const launchPlatformUrl =
      typeof req.body?.launchPlatformUrl === "string"
        ? req.body.launchPlatformUrl.trim()
        : undefined;
    try {
      const project = await updateLaunchDetailsService(userId, projectId, {
        launchType: launchType ?? undefined,
        launchPlatformUrl: launchPlatformUrl ?? undefined,
      });
      res.status(200).json(project);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to update launch details";
      const status =
        msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
      res.status(status).json({ error: msg });
    }
    return;
  }

  // Logo-only update
  const logo =
    typeof req.body?.logo === "string" ? req.body.logo.trim() : undefined;
  const hasLogoKey = "logo" in (req.body || {});
  if (hasLogoKey) {
    try {
      const markStepComplete =
        typeof req.body?.markStepComplete === "boolean"
          ? req.body.markStepComplete
          : undefined;
      const project = await updateTokenLogoService(userId, projectId, {
        logo: logo || undefined,
        markStepComplete,
      });
      res.status(200).json(project);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update logo";
      const status =
        msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
      res.status(status).json({ error: msg });
    }
    return;
  }

  // DEX URL update
  const dexUrl =
    typeof req.body?.dexUrl === "string"
      ? req.body.dexUrl.trim()
      : undefined;
  const hasDexUrlKey = "dexUrl" in (req.body || {});
  if (hasDexUrlKey) {
    try {
      const project = await updateDexUrlService(userId, projectId, {
        dexUrl: dexUrl ?? undefined,
      });
      res.status(200).json(project);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to update DEX URL";
      const status =
        msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
      res.status(status).json({ error: msg });
    }
    return;
  }

  // Token features update
  const hasTokenFeaturesKey = "tokenFeatures" in (req.body || {});
  if (hasTokenFeaturesKey && typeof req.body.tokenFeatures === "object") {
    const tf = req.body.tokenFeatures as Record<string, unknown>;
    const tokenFeatures: Record<string, unknown> = {};
    if (typeof tf.liquidityLocked === "boolean") tokenFeatures.liquidityLocked = tf.liquidityLocked;
    if (typeof tf.teamVesting === "boolean") tokenFeatures.teamVesting = tf.teamVesting;
    if (typeof tf.teamVestingDuration === "string") tokenFeatures.teamVestingDuration = tf.teamVestingDuration.trim();
    if (typeof tf.transactionTaxRates === "boolean") tokenFeatures.transactionTaxRates = tf.transactionTaxRates;
    const num = (v: unknown): number | undefined => {
      if (typeof v === "number" && !Number.isNaN(v)) return v;
      if (typeof v === "string") {
        const n = parseFloat(v);
        return !Number.isNaN(n) ? n : undefined;
      }
      return undefined;
    };
    const sellTax = num(tf.sellTax);
    if (sellTax !== undefined && sellTax >= 0 && sellTax <= 100) tokenFeatures.sellTax = sellTax;
    const buyTax = num(tf.buyTax);
    if (buyTax !== undefined && buyTax >= 0 && buyTax <= 100) tokenFeatures.buyTax = buyTax;
    const transferTax = num(tf.transferTax);
    if (transferTax !== undefined && transferTax >= 0 && transferTax <= 100) tokenFeatures.transferTax = transferTax;
    if (typeof tf.contractRenounced === "boolean") tokenFeatures.contractRenounced = tf.contractRenounced;
    if (typeof tf.burnMechanism === "boolean") tokenFeatures.burnMechanism = tf.burnMechanism;
    if (typeof tf.stakingRewards === "boolean") tokenFeatures.stakingRewards = tf.stakingRewards;
    if (typeof tf.mintAuthorityRevoked === "boolean") tokenFeatures.mintAuthorityRevoked = tf.mintAuthorityRevoked;
    if (typeof tf.freezeAuthorityRevoked === "boolean") tokenFeatures.freezeAuthorityRevoked = tf.freezeAuthorityRevoked;
    if (typeof tf.updateAuthorityRevoked === "boolean") tokenFeatures.updateAuthorityRevoked = tf.updateAuthorityRevoked;
    try {
      const project = await updateTokenFeaturesService(userId, projectId, tokenFeatures as import("../types/tokenDetails").TokenFeatures);
      res.status(200).json(project);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to update token features";
      const status =
        msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
      res.status(status).json({ error: msg });
    }
    return;
  }

  // Description and/or heroText update
  const description =
    typeof req.body?.description === "string"
      ? req.body.description.trim()
      : undefined;
  const heroText =
    typeof req.body?.heroText === "string" ? req.body.heroText.trim() : undefined;
  const hasDescriptionKey = "description" in (req.body || {});
  const hasHeroTextKey = "heroText" in (req.body || {});
  if (hasDescriptionKey || hasHeroTextKey) {
    try {
      const project = await updateTokenDescriptionService(userId, projectId, {
        ...(hasDescriptionKey && { description: description || undefined }),
        ...(hasHeroTextKey && { heroText }),
      });
      res.status(200).json(project);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to update description";
      const status =
        msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
      res.status(status).json({ error: msg });
    }
    return;
  }

  res.status(400).json({
    error:
      "Provide (address and chain), (name and symbol), (logo), (dexUrl), (tokenFeatures), (description), or (heroText)",
  });
}

/** GET /api/projects/:projectId/whitelist – list whitelist entries (auth, can edit). */
export async function getWhitelist(req: Request, res: Response): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  try {
    const project = await getProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await ensureUserCanEditProjectService(userId, project);
    const { getWhitelistData } = await import("../services/whitelistService");
    const data = await getWhitelistData(projectId);
    res.status(200).json({ lists: data.lists });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to get whitelist";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

/** POST /api/projects/:projectId/whitelist/submit – public, submit address for whitelist (no auth). */
export async function submitWhitelistEntry(req: Request, res: Response): Promise<void> {
  const projectId = req.params.projectId;
  const address = typeof req.body?.address === "string" ? req.body.address.trim() : "";
  if (!projectId || !address) {
    res.status(400).json({ error: "Project ID and address are required" });
    return;
  }
  try {
    const project = await getProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const chain = (project.tokenDetails as { chain?: string } | undefined)?.chain?.toLowerCase() ?? "";
    const isSolana = chain === "solana" || chain === "sol";
    const isEvm = /^0x[a-fA-F0-9]{40}$/.test(address);
    const isSolanaAddr = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    if (isSolana && !isSolanaAddr) {
      res.status(400).json({ error: "Invalid Solana address for this project" });
      return;
    }
    if (!isSolana && !isEvm) {
      res.status(400).json({ error: "Invalid EVM address (use 0x + 40 hex characters)" });
      return;
    }
    if (!isSolana && isSolanaAddr) {
      res.status(400).json({ error: "This project uses an EVM chain; use an EVM wallet address" });
      return;
    }
    const { addWhitelistEntry: addEntry } = await import("../services/whitelistService");
    const { entries, alreadyWhitelisted } = await addEntry(projectId, address, "default");
    res.status(200).json({ entries, alreadyWhitelisted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to submit whitelist entry";
    res.status(500).json({ error: msg });
  }
}

/** GET /api/projects/:projectId/whitelist/check?address=0x... – public, is address whitelisted? */
export async function checkWhitelist(req: Request, res: Response): Promise<void> {
  const projectId = req.params.projectId;
  const address = typeof req.query?.address === "string" ? req.query.address.trim() : "";
  if (!projectId || !address) {
    res.status(400).json({ error: "Project ID and address are required" });
    return;
  }
  try {
    const { getDefaultListEntries } = await import("../services/whitelistService");
    const entries = await getDefaultListEntries(projectId);
    const normalized = address.startsWith("0x") ? address.toLowerCase() : address;
    const whitelisted = entries.some((e) => e.address === normalized);
    res.status(200).json({ whitelisted });
  } catch (err) {
    res.status(500).json({ error: "Failed to check whitelist" });
  }
}

/** POST /api/projects/:projectId/whitelist – add address (auth, can edit, Pro plan). */
export async function addWhitelistEntry(req: Request, res: Response): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  const address = typeof req.body?.address === "string" ? req.body.address.trim() : "";
  const listId = typeof req.body?.listId === "string" ? req.body.listId.trim() || "default" : "default";
  if (!projectId || !address) {
    res.status(400).json({ error: "Project ID and address are required" });
    return;
  }
  try {
    const project = await getProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await ensureUserCanEditProjectService(userId, project);
    const { addWhitelistEntry: addEntry } = await import("../services/whitelistService");
    const { entries, alreadyWhitelisted } = await addEntry(projectId, address, listId);
    res.status(200).json({ entries, alreadyWhitelisted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to add whitelist entry";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

/** POST /api/projects/:projectId/whitelist/bulk – add many addresses in one request (auth, can edit). */
export async function addWhitelistEntriesBulk(req: Request, res: Response): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  const listId = typeof req.body?.listId === "string" ? req.body.listId.trim() || "default" : "default";
  const addresses = Array.isArray(req.body?.addresses) ? req.body.addresses : [];
  const normalizedAddresses = (addresses as unknown[])
    .filter((a: unknown): a is string => typeof a === "string")
    .map((a: string) => a.trim())
    .filter(Boolean);
  if (!projectId || normalizedAddresses.length === 0) {
    res.status(400).json({ error: "Project ID and non-empty addresses array are required" });
    return;
  }
  try {
    const project = await getProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await ensureUserCanEditProjectService(userId, project);
    const { addWhitelistEntriesBulk: addBulk } = await import("../services/whitelistService");
    const { entries, addedCount, alreadyCount } = await addBulk(projectId, listId, normalizedAddresses);
    res.status(200).json({ entries, addedCount, alreadyCount });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to add whitelist addresses";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

/** DELETE /api/projects/:projectId/whitelist – remove address (auth, can edit, Pro plan). */
export async function removeWhitelistEntry(req: Request, res: Response): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  const address =
    typeof req.body?.address === "string"
      ? req.body.address.trim()
      : typeof req.query?.address === "string"
        ? req.query.address.trim()
        : "";
  const listId =
    typeof req.body?.listId === "string"
      ? req.body.listId.trim() || "default"
      : typeof req.query?.listId === "string"
        ? req.query.listId.trim() || "default"
        : "default";
  if (!projectId || !address) {
    res.status(400).json({ error: "Project ID and address are required" });
    return;
  }
  try {
    const project = await getProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await ensureUserCanEditProjectService(userId, project);
    const { removeWhitelistEntry: removeEntry } = await import("../services/whitelistService");
    const entries = await removeEntry(projectId, address, listId);
    res.status(200).json({ entries });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to remove whitelist entry";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

/** POST /api/projects/:projectId/whitelist/lists – create new whitelist (auth, can edit). */
export async function createWhitelistList(req: Request, res: Response): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  try {
    const project = await getProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await ensureUserCanEditProjectService(userId, project);
    const { createWhitelistList: createList } = await import("../services/whitelistService");
    const list = await createList(projectId, name || "Unnamed list");
    res.status(201).json(list);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create whitelist";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

/** PATCH /api/projects/:projectId/whitelist/lists/:listId – update whitelist name (auth, can edit). */
export async function updateWhitelistListName(req: Request, res: Response): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  const listId = req.params.listId;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!projectId || !listId) {
    res.status(400).json({ error: "Project ID and list ID are required" });
    return;
  }
  try {
    const project = await getProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await ensureUserCanEditProjectService(userId, project);
    const { updateWhitelistListName: updateName } = await import("../services/whitelistService");
    const list = await updateName(projectId, listId, name);
    res.status(200).json(list);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update whitelist name";
    const status =
      msg === "Project not found" ? 404 : msg === "Whitelist not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

/** DELETE /api/projects/:projectId/whitelist/lists/:listId – delete whitelist and all its entries (auth, can edit). */
export async function deleteWhitelistList(req: Request, res: Response): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  const listId = req.params.listId;
  if (!projectId || !listId) {
    res.status(400).json({ error: "Project ID and list ID are required" });
    return;
  }
  try {
    const project = await getProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await ensureUserCanEditProjectService(userId, project);
    const { deleteWhitelistList: deleteList } = await import("../services/whitelistService");
    const data = await deleteList(projectId, listId);
    res.status(200).json({ lists: data.lists });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to delete whitelist";
    const status =
      msg === "Project not found" ? 404 : msg === "Whitelist not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

/** GET /api/projects/:projectId/airdrop – list airdrop entries (auth, can edit). */
export async function getAirdrop(req: Request, res: Response): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  try {
    const project = await getProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await ensureUserCanEditProjectService(userId, project);
    const { getAirdropData } = await import("../services/airdropService");
    const data = await getAirdropData(projectId);
    res.status(200).json({ entries: data.entries });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to get airdrop";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

/** Solana address: base58, typically 32–44 characters (matches frontend validation). */
const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** POST /api/projects/:projectId/airdrop/submit – public, submit address for airdrop (no auth). Supports EVM and Solana by project chain. */
export async function submitAirdropEntry(req: Request, res: Response): Promise<void> {
  const projectId = req.params.projectId;
  const address = typeof req.body?.address === "string" ? req.body.address.trim() : "";
  if (!projectId || !address) {
    res.status(400).json({ error: "Project ID and address are required" });
    return;
  }
  try {
    const project = await getProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const airdropConfig = (project as { airdropConfig?: { status?: string } }).airdropConfig;
    if (airdropConfig?.status === "closed") {
      res.status(400).json({ error: "Airdrop registration is closed" });
      return;
    }
    const chain = (project.tokenDetails as { chain?: string } | undefined)?.chain?.toLowerCase() ?? "";
    const isSolanaProject = chain === "solana" || chain === "sol";

    if (isSolanaProject) {
      const validSolana = address.length >= 32 && address.length <= 44 && SOLANA_ADDRESS_REGEX.test(address);
      if (!validSolana) {
        res.status(400).json({ error: "Invalid Solana address (use base58, 32–44 characters)" });
        return;
      }
    } else {
      const validEvm = /^0x[a-fA-F0-9]{40}$/.test(address);
      if (!validEvm) {
        res.status(400).json({ error: "Invalid EVM address (use 0x + 40 hex characters)" });
        return;
      }
    }

    const airdropConfigTyped = project as { airdropConfig?: { chain?: string; participationRequirements?: Array<{ type: string; count?: number; amount?: string; gasValue?: string }> } };
    const participationRequirements = airdropConfigTyped.airdropConfig?.participationRequirements;
    const airdropChain = (airdropConfigTyped.airdropConfig?.chain ?? (project.tokenDetails as { chain?: string })?.chain)?.trim() ?? "";
    const solanaCluster: "devnet" | "mainnet-beta" =
      isSolanaProject && airdropChain.toLowerCase() === "devnet" ? "devnet" : "mainnet-beta";

    const {
      getMinTransactionsRequirement,
      getMinNativeBalanceRequirement,
      getMinGasSpentRequirement,
      getActivityDaysRequirement,
      getMinTokenBalanceRequirement,
      checkEvmMinTransactions,
      checkSolanaMinTransactions,
      checkEvmMinNativeBalance,
      checkSolanaMinNativeBalance,
      checkEvmMinGasSpent,
      checkSolanaMinGasSpent,
      checkEvmActivityDays,
      checkSolanaActivityDays,
      checkEvmMinTokenBalance,
      checkSolanaMinTokenBalance,
    } = await import("../services/participationRequirementsService");
    const evmApiKey = process.env.ETHERSCAN_API_KEY;

    const minTx = getMinTransactionsRequirement(participationRequirements);
    if (minTx != null) {
      if (isSolanaProject) {
        const result = await checkSolanaMinTransactions(address, solanaCluster, minTx);
        if (!result.ok) {
          res.status(400).json({ error: result.message ?? `Minimum ${minTx} transactions required.` });
          return;
        }
      } else {
        const result = await checkEvmMinTransactions(address, airdropChain, minTx, evmApiKey);
        if (!result.ok) {
          res.status(400).json({ error: result.message ?? `Minimum ${minTx} transactions required.` });
          return;
        }
      }
    }

    const minNativeAmount = getMinNativeBalanceRequirement(participationRequirements);
    if (minNativeAmount != null) {
      if (isSolanaProject) {
        const result = await checkSolanaMinNativeBalance(address, solanaCluster, minNativeAmount);
        if (!result.ok) {
          res.status(400).json({ error: result.message ?? "Insufficient native balance." });
          return;
        }
      } else {
        if (!airdropChain) {
          res.status(400).json({ error: "Airdrop chain is required to check minimum native balance." });
          return;
        }
        const result = await checkEvmMinNativeBalance(address, airdropChain, minNativeAmount);
        if (!result.ok) {
          res.status(400).json({ error: result.message ?? "Insufficient native balance." });
          return;
        }
      }
    }

    const minGasSpent = getMinGasSpentRequirement(participationRequirements);
    if (minGasSpent != null) {
      if (isSolanaProject) {
        const result = await checkSolanaMinGasSpent(address, solanaCluster, minGasSpent);
        if (!result.ok) {
          res.status(400).json({ error: result.message ?? "Minimum gas spent not met." });
          return;
        }
      } else {
        if (!airdropChain) {
          res.status(400).json({ error: "Airdrop chain is required to check minimum gas spent." });
          return;
        }
        const result = await checkEvmMinGasSpent(address, airdropChain, minGasSpent, evmApiKey);
        if (!result.ok) {
          res.status(400).json({ error: result.message ?? "Minimum gas spent not met." });
          return;
        }
      }
    }

    const minActivityDays = getActivityDaysRequirement(participationRequirements);
    if (minActivityDays != null) {
      if (isSolanaProject) {
        const result = await checkSolanaActivityDays(address, solanaCluster, minActivityDays);
        if (!result.ok) {
          res.status(400).json({ error: result.message ?? "Activity over multiple days not met." });
          return;
        }
      } else {
        if (!airdropChain) {
          res.status(400).json({ error: "Airdrop chain is required to check activity days." });
          return;
        }
        const result = await checkEvmActivityDays(address, airdropChain, minActivityDays, evmApiKey);
        if (!result.ok) {
          res.status(400).json({ error: result.message ?? "Activity over multiple days not met." });
          return;
        }
      }
    }

    const minTokenBalance = getMinTokenBalanceRequirement(participationRequirements);
    if (minTokenBalance != null) {
      const { amount, tokenContract } = minTokenBalance;
      if (isSolanaProject) {
        const result = await checkSolanaMinTokenBalance(address, solanaCluster, amount, tokenContract);
        if (!result.ok) {
          res.status(400).json({ error: result.message ?? "Minimum token balance not met." });
          return;
        }
      } else {
        if (!airdropChain) {
          res.status(400).json({ error: "Airdrop chain is required to check minimum token balance." });
          return;
        }
        const result = await checkEvmMinTokenBalance(address, airdropChain, amount, tokenContract);
        if (!result.ok) {
          res.status(400).json({ error: result.message ?? "Minimum token balance not met." });
          return;
        }
      }
    }

    const { addAirdropEntry: addEntry } = await import("../services/airdropService");
    const { entries, alreadyAdded } = await addEntry(projectId, address);
    res.status(200).json({ entries, alreadyAdded });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to submit airdrop entry";
    res.status(500).json({ error: msg });
  }
}

/** GET /api/projects/:projectId/airdrop/check?address=0x... – public, is address in airdrop list? */
export async function checkAirdrop(req: Request, res: Response): Promise<void> {
  const projectId = req.params.projectId;
  const address = typeof req.query?.address === "string" ? req.query.address.trim() : "";
  if (!projectId || !address) {
    res.status(400).json({ error: "Project ID and address are required" });
    return;
  }
  try {
    const { getAirdropEntries } = await import("../services/airdropService");
    const entries = await getAirdropEntries(projectId);
    const normalized = address.startsWith("0x") ? address.toLowerCase() : address;
    const registered = entries.some((e) => e.address === normalized);
    res.status(200).json({ registered });
  } catch (err) {
    res.status(500).json({ error: "Failed to check airdrop" });
  }
}

/** POST /api/projects/:projectId/airdrop – add address (auth, can edit). */
export async function addAirdropEntry(req: Request, res: Response): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  const address = typeof req.body?.address === "string" ? req.body.address.trim() : "";
  if (!projectId || !address) {
    res.status(400).json({ error: "Project ID and address are required" });
    return;
  }
  try {
    const project = await getProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await ensureUserCanEditProjectService(userId, project);
    const { addAirdropEntry: addEntry } = await import("../services/airdropService");
    const { entries, alreadyAdded } = await addEntry(projectId, address);
    res.status(200).json({ entries, alreadyAdded });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to add airdrop entry";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

/** POST /api/projects/:projectId/airdrop/bulk – add many addresses in one request (auth, can edit). */
export async function addAirdropEntriesBulk(req: Request, res: Response): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  const addresses = Array.isArray(req.body?.addresses) ? req.body.addresses : [];
  const normalizedAddresses = (addresses as unknown[])
    .filter((a: unknown): a is string => typeof a === "string")
    .map((a: string) => a.trim())
    .filter(Boolean);
  if (!projectId || normalizedAddresses.length === 0) {
    res.status(400).json({ error: "Project ID and non-empty addresses array are required" });
    return;
  }
  try {
    const project = await getProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await ensureUserCanEditProjectService(userId, project);
    const { addAirdropEntriesBulk: addBulk } = await import("../services/airdropService");
    const { entries, addedCount, alreadyCount } = await addBulk(projectId, normalizedAddresses);
    res.status(200).json({ entries, addedCount, alreadyCount });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to add airdrop addresses";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

/** DELETE /api/projects/:projectId/airdrop – remove address (auth, can edit). */
export async function removeAirdropEntry(req: Request, res: Response): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  const address =
    typeof req.body?.address === "string"
      ? req.body.address.trim()
      : typeof req.query?.address === "string"
        ? req.query.address.trim()
        : "";
  if (!projectId || !address) {
    res.status(400).json({ error: "Project ID and address are required" });
    return;
  }
  try {
    const project = await getProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await ensureUserCanEditProjectService(userId, project);
    const { removeAirdropEntry: removeEntry } = await import("../services/airdropService");
    const entries = await removeEntry(projectId, address);
    res.status(200).json({ entries });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to remove airdrop entry";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

/** DELETE /api/projects/:projectId/airdrop/entries – remove all airdrop entries (auth, can edit). */
export async function clearAirdropEntries(req: Request, res: Response): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  try {
    const project = await getProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await ensureUserCanEditProjectService(userId, project);
    const { clearAirdropEntries: clearEntries } = await import("../services/airdropService");
    await clearEntries(projectId);
    res.status(200).json({ entries: [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to clear airdrop entries";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

/** PATCH /api/projects/:projectId/airdrop/config – update airdrop config (contractAddress, chain, taskType, status). */
export async function updateAirdropConfig(req: Request, res: Response): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const body = req.body || {};
  try {
    const project = await getProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await ensureUserCanEditProjectService(userId, project);
    await updateProjectAirdropConfigService(userId, projectId, {
      contractAddress: body.contractAddress,
      contractOwner: body.contractOwner,
      solanaAirdropOwner: body.solanaAirdropOwner,
      chain: body.chain,
      taskType: body.taskType,
      eligibilityTasks: body.eligibilityTasks,
      participationRequirements: body.participationRequirements,
      status: body.status,
      distribution: body.distribution,
    });
    const updated = await getProjectById(projectId);
    res.status(200).json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update airdrop config";
    const status =
      msg === "Project not found" ? 404 : msg === "Forbidden" ? 403 : 500;
    res.status(status).json({ error: msg });
  }
}

/** GET /api/projects/:projectId/airdrop/token-info?contract=0x... – fetch token name and symbol (auth). */
export async function getTokenInfo(req: Request, res: Response): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  const contract = typeof req.query?.contract === "string" ? req.query.contract.trim() : "";
  if (!projectId || !contract) {
    res.status(400).json({ error: "Project ID and contract are required" });
    return;
  }
  try {
    const project = await getProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await ensureUserCanEditProjectService(userId, project);
    const projectChain = ((project as { tokenDetails?: { chain?: string } }).tokenDetails?.chain ?? "").toLowerCase().trim();
    const airdropChain = ((project as { airdropConfig?: { chain?: string } }).airdropConfig?.chain ?? "").trim();
    const isSolana = projectChain === "solana" || projectChain === "sol";
    const solanaCluster: "devnet" | "mainnet-beta" =
      isSolana && airdropChain.toLowerCase() === "devnet" ? "devnet" : "mainnet-beta";
    const { getEvmTokenInfo, getSolanaTokenInfo } = await import("../services/participationRequirementsService");
    if (isSolana) {
      const info = await getSolanaTokenInfo(contract, solanaCluster);
      if (!info) {
        res.status(400).json({ error: "Could not fetch token info. Ensure the mint exists and has Metaplex or Token-2022 metadata." });
        return;
      }
      res.status(200).json(info);
      return;
    }
    const evmChain = airdropChain || projectChain || "1";
    const info = await getEvmTokenInfo(contract, evmChain);
    if (!info) {
      res.status(400).json({ error: "Could not fetch token info. Ensure the contract is a valid ERC20." });
      return;
    }
    res.status(200).json(info);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch token info";
    res.status(500).json({ error: msg });
  }
}

/** GET /api/projects/:projectId/airdrop/solana/fee-estimate?batchCount=N – estimate SOL to pay relayer for N batches (includes 10% buffer). */
export async function getSolanaRelayerFeeEstimate(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  const batchCount = Math.max(0, Math.floor(Number(req.query.batchCount) || 0));
  if (batchCount < 1) {
    res.status(400).json({ error: "batchCount must be at least 1" });
    return;
  }
  try {
    const project = await getProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await ensureUserCanEditProjectService(userId, project);

    const { getSolanaRelayerFeeEstimate: getFeeEstimate } = await import(
      "../services/solanaRelayService"
    );
    const estimate = getFeeEstimate(batchCount);
    if (!estimate) {
      res.status(503).json({ error: "Relayer not configured" });
      return;
    }
    res.status(200).json(estimate);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to get fee estimate";
    res.status(500).json({ error: msg });
  }
}

/** GET /api/projects/:projectId/airdrop/solana/relayer – relayer account address and SOL balance (test only / devnet). */
export async function getSolanaRelayerInfo(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  try {
    const project = await getProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await ensureUserCanEditProjectService(userId, project);

    const airdropChain = ((project as { airdropConfig?: { chain?: string } }).airdropConfig?.chain ?? "").trim();
    const cluster =
      airdropChain === "mainnet-beta" ? ("mainnet-beta" as const) : ("devnet" as const);
    const { getSolanaRelayerInfo: getRelayerInfo } = await import(
      "../services/solanaRelayService"
    );
    const info = await getRelayerInfo(cluster);
    if (!info) {
      res.status(200).json({ configured: false });
      return;
    }
    res.status(200).json({ configured: true, ...info });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to get relayer info";
    res.status(500).json({ error: msg });
  }
}

/** Batch size must match relayer (solanaRelayService.BATCH_SIZE). */
const SOLANA_RELAY_BATCH_SIZE = 5;

/** POST /api/projects/:projectId/airdrop/solana/continue-distribution – run remaining batches via backend relayer (one user confirmation). */
export async function continueSolanaDistribution(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const projectId = req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }
  // Allow up to 5 min for relayer to send all batches
  req.setTimeout(300_000);
  const body = req.body as {
    airdropPda?: string;
    mint?: string;
    recipientAddresses?: string[];
    amountPerRecipientBase?: number;
    cluster?: "devnet" | "mainnet-beta";
    /** Required: signature of the confirmed SOL transfer to the relayer. Ensures batches only run after user has paid. */
    paymentTxSignature?: string;
  };
  try {
    const project = await getProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await ensureUserCanEditProjectService(userId, project);

    const airdropPda = body.airdropPda?.trim();
    const mint = body.mint?.trim();
    const recipientAddresses = Array.isArray(body.recipientAddresses)
      ? body.recipientAddresses.filter((a) => typeof a === "string" && a.trim())
      : [];
    const amountPerRecipientBase =
      typeof body.amountPerRecipientBase === "number" && body.amountPerRecipientBase > 0
        ? body.amountPerRecipientBase
        : 0;
    const paymentTxSignature =
      typeof body.paymentTxSignature === "string" ? body.paymentTxSignature.trim() : "";

    if (!airdropPda || !mint || recipientAddresses.length === 0 || amountPerRecipientBase <= 0) {
      res.status(400).json({
        error: "airdropPda, mint, recipientAddresses, and amountPerRecipientBase are required",
      });
      return;
    }

    if (!paymentTxSignature) {
      res.status(400).json({
        error: "paymentTxSignature is required. Pay the relayer first, then call with the confirmed transaction signature.",
      });
      return;
    }

    const { verifyPaymentTransaction, continueSolanaDistribution: runRelay } = await import(
      "../services/solanaRelayService"
    );
    const cluster = body.cluster === "mainnet-beta" ? "mainnet-beta" : "devnet";
    const paymentOk = await verifyPaymentTransaction(cluster, paymentTxSignature);
    if (!paymentOk) {
      res.status(400).json({
        error: "Payment transaction not found or not confirmed. Confirm the SOL transfer in your wallet first, then try again.",
      });
      return;
    }

    const { getDistributionFromS3, saveDistributionToS3 } = await import("../services/airdropService");

    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("Cache-Control", "no-cache");
    res.status(200);
    res.flushHeaders?.();

    const writeLine = (obj: object) => {
      res.write(JSON.stringify(obj) + "\n");
      (res as { flush?: (cb?: () => void) => void }).flush?.();
    };

    try {
      const result = await runRelay({
        airdropPda,
        mint,
        recipientAddresses,
        amountPerRecipientBase,
        cluster,
        projectId,
        onBatchComplete: async (signature) => {
          const distribution = await getDistributionFromS3(projectId);
          if (distribution?.batches) {
            const batchIndex = distribution.batches.length + 1;
            const totalBatches = Math.ceil(
              (distribution.totalRecipients ?? 0) / SOLANA_RELAY_BATCH_SIZE
            );
            const alreadySent = (distribution.batches.length ?? 0) * SOLANA_RELAY_BATCH_SIZE;
            const recipientsInBatch = Math.min(
              SOLANA_RELAY_BATCH_SIZE,
              (distribution.totalRecipients ?? 0) - alreadySent
            );
            const amountPerRecipientHuman = Number(distribution.amountPerRecipient ?? 0);
            const amountTokens = Number.isFinite(amountPerRecipientHuman)
              ? String(Math.round(recipientsInBatch * amountPerRecipientHuman))
              : String(recipientsInBatch * amountPerRecipientBase);
            distribution.batches.push({
              batchIndex,
              recipients: recipientsInBatch,
              amountTokens,
              status: "done",
              tx: signature,
            });
            if (batchIndex >= totalBatches) {
              distribution.status = "completed";
            }
            await saveDistributionToS3(projectId, distribution);
          }
          writeLine({ type: "batch", signature });
        },
      });

      if (result.error) {
        writeLine({ type: "error", error: result.error, signatures: result.signatures });
      } else {
        writeLine({ type: "done", signatures: result.signatures });
      }
    } catch (relayErr) {
      const msg = relayErr instanceof Error ? relayErr.message : "Continue distribution failed";
      writeLine({ type: "error", error: msg, signatures: [] });
    }
    res.end();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Continue distribution failed";
    res.status(500).json({ error: msg });
  }
}
