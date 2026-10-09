import type { Request, Response, NextFunction } from "express";
import type { z } from "zod";

type SchemaWithBody = { shape: { body: z.ZodTypeAny } };
type SchemaWithQuery = { shape: { query: z.ZodTypeAny } };
type SchemaWithParams = { shape: { params: z.ZodTypeAny } };

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

/** Validates `req.query` (e.g. GET handlers). */
export function validateQuery(schema: SchemaWithQuery) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.query = schema.shape.query.parse(req.query) as Request["query"];
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Validates `req.params` (e.g. `:recordId` UUID). */
export function validateParams(schema: SchemaWithParams) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.params = schema.shape.params.parse(req.params) as Request["params"];
      next();
    } catch (err) {
      next(err);
    }
  };
}
