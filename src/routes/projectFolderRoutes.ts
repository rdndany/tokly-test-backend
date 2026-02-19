import { Router } from "express";
import {
  createFolderHandler,
  listFoldersHandler,
  getFolderHandler,
  updateFolderHandler,
  deleteFolderHandler,
  addProjectsToFolderHandler,
} from "../controllers/ProjectFolderController";
import { checkAuth } from "../middlewares/auth";

const router = Router();

router.get("/", checkAuth, listFoldersHandler);
router.post("/", checkAuth, createFolderHandler);
router.get("/:folderId", checkAuth, getFolderHandler);
router.patch("/:folderId", checkAuth, updateFolderHandler);
router.delete("/:folderId", checkAuth, deleteFolderHandler);
router.post("/:folderId/projects", checkAuth, addProjectsToFolderHandler);

export default router;
