import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Request, Response } from "express";
import { put } from "@vercel/blob";
import { fileTypeFromBuffer } from "file-type";

import { HttpError } from "../../utils/http-error.js";
import { newImageFilename, uploadDirectory } from "./image-upload.middleware.js";

export const uploadImagesHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Authentication required");
  const files = req.files;
  if (!Array.isArray(files) || files.length === 0) {
    throw new HttpError(422, "At least one image file is required in the 'files' field");
  }
  const validatedFiles = await Promise.all(
    files.map(async (file) => {
      const detectedType = await fileTypeFromBuffer(file.buffer);
      if (!detectedType || detectedType.mime !== file.mimetype) {
        throw new HttpError(415, "Uploaded file content does not match an accepted image type");
      }
      return {
        file,
        filename: newImageFilename(file.mimetype),
      };
    }),
  );

  if (process.env.VERCEL && !process.env.BLOB_READ_WRITE_TOKEN) {
    throw new HttpError(503, "Image storage is not configured for this deployment");
  }

  const uploadedImages = await Promise.all(
    validatedFiles.map(async ({ file, filename }) => {
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        const blob = await put(`uploads/${filename}`, file.buffer, {
          access: "public",
          contentType: file.mimetype,
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });
        return {
          url: blob.url,
          contentType: file.mimetype,
          size: file.size,
        };
      }

      await mkdir(uploadDirectory, { recursive: true });
      await writeFile(resolve(uploadDirectory, filename), file.buffer, {
        flag: "wx",
      });
      return {
        url: `/uploads/${filename}`,
        contentType: file.mimetype,
        size: file.size,
      };
    }),
  );

  res.status(201).json({
    success: true,
    message: "Images uploaded successfully",
    data: uploadedImages,
  });
};
