
import type { Request, Response, NextFunction } from "express";

export const errorHandler = (
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error("Error:", error);

  res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
};
