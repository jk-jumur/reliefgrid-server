import { Router } from "express";

import { authenticate } from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/authorize.middleware.js";
import type { ExtendedRequest } from "../types/request.types.js";

const router = Router();

// Any authenticated and active user
router.get("/protected", authenticate, (req: ExtendedRequest, res) => {
  res.status(200).json({
    success: true,
    message: "You have successfully accessed a protected route",
    data: {
      user: req.user,
    },
  });
});

// System admin only
router.get(
  "/admin-only",
  authenticate,
  authorizeRoles("system_admin"),
  (_req, res) => {
    res.status(200).json({
      success: true,
      message: "Welcome, System Administrator",
    });
  }
);

// Coordinator and admin
router.get(
  "/coordinator-only",
  authenticate,
  authorizeRoles("emergency_coordinator", "system_admin"),
  (_req, res) => {
    res.status(200).json({
      success: true,
      message: "Coordinator access granted",
    });
  }
);

export default router;