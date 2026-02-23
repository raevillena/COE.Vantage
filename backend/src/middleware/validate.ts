import type { Request, Response, NextFunction } from "express";
import type { z } from "zod";

type SchemaWithBody = { shape: { body: z.ZodTypeAny } };

/** Middleware that parses and validates req.body using a Zod schema; passes ZodError to error handler. */
export function validate(schema: SchemaWithBody) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.shape.body.parse(req.body);
      next();
    } catch (err) {
      next(err);
    }
  };
}
