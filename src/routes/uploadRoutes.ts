import { Router } from "express";
import { generatePresignedUrl, deleteFile } from "../controllers/UploadController";
import { checkAuth } from "../middlewares/auth";

const router = Router();
router.use(checkAuth);

router.post("/presigned-url", generatePresignedUrl);
router.delete("/delete", deleteFile);

export default router;
