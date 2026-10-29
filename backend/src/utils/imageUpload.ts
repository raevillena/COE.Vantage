import multer from "multer";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { badRequest } from "./errors.js";
import { sniffImageType } from "../modules/feedback/feedbackService.js";

export const AVATAR_MAX_BYTES = 1 * 1024 * 1024; // the browser shrinks avatars to 256 px first, so 1 MB is generous
export const CARD_IMAGE_MAX_BYTES = 3 * 1024 * 1024;

const mb = (bytes: number) => `${bytes / 1024 / 1024} MB`;

/** Accepts one picture in the multipart field `field`, up to `maxBytes`, and says so plainly when it is too big. */
export function singleImage(field: string, maxBytes: number): RequestHandler {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: 1, fields: 5 } }).single(field);
  return (req: Request, res: Response, next: NextFunction) => {
    upload(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        next(badRequest(err.code === "LIMIT_FILE_SIZE" ? `The picture is larger than ${mb(maxBytes)}. Choose a smaller one.` : "The upload could not be read."));
        return;
      }
      next(err);
    });
  };
}

/** The uploaded picture, checked by its first bytes so a renamed file cannot be stored as one. */
export function uploadedImage(req: Request): { mimeType: string; size: number; data: Buffer } {
  const file = req.file;
  if (!file) throw badRequest("Choose a picture to upload.");
  const mimeType = sniffImageType(file.buffer);
  if (!mimeType) throw badRequest("The file is not a PNG, JPEG or WebP picture.");
  return { mimeType, size: file.buffer.length, data: file.buffer };
}
