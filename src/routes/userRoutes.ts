import { Router } from "express";
import {
  getProfileByHandle,
  getProfileProjects,
  follow,
  unfollow,
  getMyPreferences,
  getMyCredits,
  deleteAccount,
} from "../controllers/UserController";
import { optionalAuth, checkAuth } from "../middlewares/auth";

const router = Router();

router.get("/me/preferences", checkAuth, getMyPreferences);
router.get("/me/credits", checkAuth, getMyCredits);
router.delete("/me/account", checkAuth, deleteAccount);
router.get("/profile/:handle", optionalAuth, getProfileByHandle);
router.get("/profile/:handle/projects", getProfileProjects); // Public – no auth
router.post("/follow", checkAuth, follow);
router.delete("/follow/:handle", checkAuth, unfollow);

export default router;
