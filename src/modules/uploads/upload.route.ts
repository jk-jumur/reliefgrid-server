import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeRoles } from "../../middleware/authorize.middleware.js";
import { uploadImages } from "./image-upload.middleware.js";
import { uploadImagesHandler } from "./upload.controller.js";

const router = Router();

router.post(
  "/images",
  authenticate,
  authorizeRoles(
    "citizen",
    "volunteer",
    "relief_organization",
    "emergency_coordinator",
    "shelter_manager",
    "system_admin"
  ),
  uploadImages,
  uploadImagesHandler
);

export default router;
