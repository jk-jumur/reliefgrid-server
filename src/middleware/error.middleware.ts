
import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { HttpError } from "../utils/http-error.js";

export const errorHandler = (
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error("Error:", error);

  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }

  if (error instanceof multer.MulterError) {
    const statusCode = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    res.status(statusCode).json({
      success: false,
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? "Image files cannot exceed 5 MB"
          : "Invalid image upload request",
    });
    return;
  }

  res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
};
