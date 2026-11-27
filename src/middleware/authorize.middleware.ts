



import type { Request, Response, NextFunction } from "express";
import type { UserRole } from "../constants/roles.js";
import type { AuthenticatedUser } from "../types/auth.types.js";

type AuthRequest = Request & {
  user?: AuthenticatedUser;
};

export const authorizeRoles = (...allowedRoles: UserRole[]) => {
  return (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource",
      });
      return;
    }

    next();
  };
};

