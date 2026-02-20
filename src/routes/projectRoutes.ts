import { Router } from "express";
import {
  createProject,
  deleteProject,
  generateHeroText,
  getProject,
  getProjectByPublishUrl,
  getProjectOgData,
  getProjectHistory,
  getTokenPreview,
  listProjects,
  starProject,
  unstarProject,
  updateProjectTitle,
  updateProjectCategory,
  updateProjectVisibility,
  updateProjectSeo,
  checkPublishUrlAvailability,
  updateProjectPublishAddress,
  unpublishProject,
  updateHideToklyBadge,
  captureThumbnail,
  transferProject,
  removeProjectFromFolderHandler,
  updateSocialLinks,
  updateTemplate,
  updateSectionVisibility,
  updateSectionLayout,
  updateTokenomics,
  updateRoadmap,
  updateFAQ,
  updateTeam,
  updateAuditKyc,
  updateListingPlatforms,
  updateTokenDetails,
} from "../controllers/ProjectController";
import {
  chat,
  getChatHistory,
  saveQuestionnaire,
} from "../controllers/ChatController";
import {
  getFiles,
  putFile,
} from "../controllers/ProjectFileController";
import {
  submitFeedback,
  removeFeedback,
} from "../controllers/ChatFeedbackController";
import { checkAuth } from "../middlewares/auth";

const router = Router();

router.get("/", checkAuth, listProjects);
router.get("/by-publish-url", getProjectByPublishUrl); // Public – no auth
router.get("/check-publish-url", checkAuth, checkPublishUrlAvailability);
router.post("/", checkAuth, createProject);
router.post("/:projectId/star", checkAuth, starProject);
router.delete("/:projectId/star", checkAuth, unstarProject);
router.delete("/:projectId", checkAuth, deleteProject);
router.delete("/:projectId/folder", checkAuth, removeProjectFromFolderHandler);
router.get("/:projectId/history", checkAuth, getProjectHistory);
router.get("/:projectId/og-data", getProjectOgData); // Public – for OG image generation
router.get("/:projectId", checkAuth, getProject);
router.patch("/:projectId", checkAuth, updateProjectTitle);
router.patch("/:projectId/category", checkAuth, updateProjectCategory);
router.patch("/:projectId/visibility", checkAuth, updateProjectVisibility);
router.patch("/:projectId/seo", checkAuth, updateProjectSeo);
router.patch("/:projectId/publish-address", checkAuth, updateProjectPublishAddress);
router.patch("/:projectId/unpublish", checkAuth, unpublishProject);
router.patch("/:projectId/hide-tokly-badge", checkAuth, updateHideToklyBadge);
router.post("/:projectId/capture-thumbnail", checkAuth, captureThumbnail);
router.patch("/:projectId/transfer", checkAuth, transferProject);
router.get("/:projectId/token-preview", checkAuth, getTokenPreview);
router.post("/:projectId/generate-hero-text", checkAuth, generateHeroText);
router.patch("/:projectId/token-details", checkAuth, updateTokenDetails);
router.patch("/:projectId/social-links", checkAuth, updateSocialLinks);
router.patch("/:projectId/template", checkAuth, updateTemplate);
router.patch("/:projectId/section-visibility", checkAuth, updateSectionVisibility);
router.patch("/:projectId/section-layout", checkAuth, updateSectionLayout);
router.patch("/:projectId/tokenomics", checkAuth, updateTokenomics);
router.patch("/:projectId/roadmap", checkAuth, updateRoadmap);
router.patch("/:projectId/faq", checkAuth, updateFAQ);
router.patch("/:projectId/team", checkAuth, updateTeam);
router.patch("/:projectId/audit-kyc", checkAuth, updateAuditKyc);
router.patch("/:projectId/listing-platforms", checkAuth, updateListingPlatforms);
router.get("/:projectId/chat", checkAuth, getChatHistory);
router.post("/:projectId/chat", checkAuth, chat);
router.post("/:projectId/chat/questionnaire", checkAuth, saveQuestionnaire);
router.post("/:projectId/chat/feedback", checkAuth, submitFeedback);
router.delete("/:projectId/chat/feedback", checkAuth, removeFeedback);
router.get("/:projectId/files", checkAuth, getFiles);
router.put("/:projectId/files", checkAuth, putFile);

export default router;
