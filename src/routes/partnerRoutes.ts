import { Router } from "express";
import {
  checkPartnerPublishUrlHandler,
  createPartnerProject,
  generatePartnerCreateHeroTextHandler,
  previewPartnerTokenHandler,
  verifyPartnerCreatePayloadHandler,
} from "../controllers/PartnerCreateController";
import { checkAuth } from "../middlewares/auth";

const router = Router();

router.get("/create/verify", verifyPartnerCreatePayloadHandler);
router.get("/create/check-publish-url", checkPartnerPublishUrlHandler);
router.get("/create/preview-token", previewPartnerTokenHandler);
router.post("/create/generate-hero-text", generatePartnerCreateHeroTextHandler);
router.post("/create/projects", checkAuth, createPartnerProject);

export default router;
