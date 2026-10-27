import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { MulterError } from "multer";
import { Prisma } from "@prisma/client";
import { AppError } from "../utils/errors.js";
import { env } from "../config/env.js";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }

  if (err instanceof MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "A picture is larger than 3 MB"
        : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE"
          ? "Attach at most 5 pictures"
          : "The upload could not be read";
    res.status(400).json({ message });
    return;
  }

  if (err instanceof ZodError) {
    const first = err.issues[0];
    res.status(400).json({
      message: first?.message ?? "Validation error",
      errors: err.flatten().fieldErrors,
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      res.status(409).json({ message: "A record with this value already exists." });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({ message: "Record not found." });
      return;
    }
  }

  if (env.NODE_ENV === "development") {
    console.error(err);
    res.status(500).json({
      message: err instanceof Error ? err.message : "Internal server error",
      stack: err instanceof Error ? err.stack : undefined,
    });
    return;
  }

  res.status(500).json({ message: "Internal server error" });
}
