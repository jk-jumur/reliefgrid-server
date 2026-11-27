import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import multer from "multer";

import { HttpError } from "../../utils/http-error.js";

export const uploadDirectory = resolve(process.cwd(), "uploads");

const extensionsByMimeType: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export const uploadImages = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 10,
  },
  fileFilter: (_req, file, callback) => {
    if (!extensionsByMimeType[file.mimetype]) {
      callback(new HttpError(415, "Only JPEG, PNG, and WebP images are accepted"));
      return;
    }
    callback(null, true);
  },
}).array("files", 10);

const imageExtension = (mimeType: string): string | undefined =>
  extensionsByMimeType[mimeType];

export const newImageFilename = (mimeType: string): string => {
  const extension = imageExtension(mimeType);
  if (!extension) {
    throw new HttpError(415, "Only JPEG, PNG, and WebP images are accepted");
  }
  return `${randomUUID()}${extension}`;
};
