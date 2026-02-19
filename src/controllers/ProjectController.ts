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
  checkPublishUrlAvailability as checkPublishUrlAvailabilityService,
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
  updateProjectTokenomics as updateTokenomicsService,
  updateProjectRoadmap as updateRoadmapService,
  updateProjectFAQ as updateFAQService,
  updateProjectTeam as updateTeamService,
  updateProjectAuditKyc as updateAuditKycService,
  updateProjectListingPlatforms as updateListingPlatformsService,
  updateHideToklyBadge as updateHideToklyBadgeService,
} from "../services/projectService";
import { getProjectHistory as getProjectHistoryService } from "../services/projectHistoryService";
import StarredProjectModel from "../models/StarredProject";
import { removeProjectFromFolder } from "../services/projectFolderService";
import { sendMessage as sendChatMessage } from "../services/chatService";
import {
  getOrCreateDefaultWorkspace,
  ensureUserCanAccessWorkspace,
  listWorkspacesByUser,
} from "../services/workspaceService";

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
    req.body?.projectVisibility === "public" ? "public" : "workshop";
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
      const project = await updateTokenLogoService(userId, projectId, {
        logo: logo || undefined,
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
