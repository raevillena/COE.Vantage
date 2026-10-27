import { Router } from "express";
import type { Request, Response } from "express";
import multer from "multer";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate, validateParams, validateQuery } from "../../middleware/validate.js";
import {
  createFeedbackSchema,
  idParamsSchema,
  listFeedbackQuerySchema,
  purgeQuerySchema,
  updateFeedbackSchema,
} from "./feedbackSchemas.js";
import type { CreateFeedbackBody, ListFeedbackQuery, PurgeQuery, UpdateFeedbackBody } from "./feedbackSchemas.js";
import {
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  createFeedback,
  deleteFeedback,
  deleteImage,
  getFeedback,
  getImage,
  imageStorage,
  listFeedback,
  purgeImages,
  removeImagesOf,
  updateFeedback,
} from "./feedbackService.js";

const router = Router();
router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_IMAGES, fields: 10 },
});

const admin = authorize("ADMIN");

router.get("/", validateQuery(listFeedbackQuerySchema), async (req: Request, res: Response) => {
  res.json(await listFeedback(req.query as unknown as ListFeedbackQuery));
});

// Every role may submit, including read-only roles: it is feedback, not a change to scheduling data.
router.post("/", upload.array("images", MAX_IMAGES), validate(createFeedbackSchema), async (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  res.status(201).json(await createFeedback(req.user!.id, req.body as CreateFeedbackBody, files));
});

// Fixed paths before "/:id".
router.get("/storage", admin, validateQuery(purgeQuerySchema), async (req: Request, res: Response) => {
  res.json(await imageStorage(req.query as unknown as PurgeQuery));
});

router.delete("/images", admin, validateQuery(purgeQuerySchema), async (req: Request, res: Response) => {
  res.json(await purgeImages(req.query as unknown as PurgeQuery));
});

router.get("/images/:id", validateParams(idParamsSchema), async (req: Request, res: Response) => {
  const img = await getImage(req.params.id);
  res.setHeader("Content-Type", img.mimeType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.send(Buffer.from(img.data));
});

router.delete("/images/:id", admin, validateParams(idParamsSchema), async (req: Request, res: Response) => {
  await deleteImage(req.params.id);
  res.status(204).end();
});

router.get("/:id", validateParams(idParamsSchema), async (req: Request, res: Response) => {
  res.json(await getFeedback(req.params.id));
});

router.patch("/:id", admin, validateParams(idParamsSchema), validate(updateFeedbackSchema), async (req: Request, res: Response) => {
  res.json(await updateFeedback(req.params.id, req.body as UpdateFeedbackBody));
});

router.delete("/:id/images", admin, validateParams(idParamsSchema), async (req: Request, res: Response) => {
  res.json(await removeImagesOf(req.params.id));
});

router.delete("/:id", admin, validateParams(idParamsSchema), async (req: Request, res: Response) => {
  await deleteFeedback(req.params.id);
  res.status(204).end();
});

export const feedbackRoutes = router;
