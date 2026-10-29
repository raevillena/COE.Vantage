import { Router } from "express";
import { list, getById, create, update, remove, listTrash, restore, permanentDelete, getPrioritizedSubjects, listAssignableFaculty } from "./userController.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { z } from "zod";
import type { Request, Response } from "express";
import { singleImage, uploadedImage, AVATAR_MAX_BYTES } from "../../utils/imageUpload.js";
import { getAvatar, removeAvatar, setAvatar, updateMyName } from "./userProfileService.js";
import { createUserSchema, updateUserSchema } from "./userSchemas.js";

const updateMyNameSchema = z.object({ body: z.object({ name: z.string().trim().min(1, "Name is required").max(100) }) });

const router = Router();

router.use(authenticate);

/** List users: ADMIN can list all; CHAIRMAN/DEAN/FACULTY/OFFICER can list when filtering by role=FACULTY (for schedule dropdowns). */
router.get(
  "/",
  (req, res, next) => {
    const isAdmin = req.user?.role === "ADMIN";
    const isFacultyOnlyList =
      req.user?.role === "CHAIRMAN" || 
      req.user?.role === "DEAN" || 
      req.user?.role === "FACULTY" || 
      req.user?.role === "OFFICER" ||
      req.user?.role === "COLLEGE_SECRETARY" ||
      req.user?.role === "PRESIDENT" ||
      req.user?.role === "UNIT";
    if (isAdmin || isFacultyOnlyList) return next();
    return authorize("ADMIN")(req, res, next);
  },
  list
);
router.get("/trash", authorize("ADMIN"), listTrash);
router.delete("/trash/:id", authorize("ADMIN"), permanentDelete);

// A person's own details: their name and picture. Declared before "/:id" so "me" is not read as an id.
router.patch("/me", validate(updateMyNameSchema), async (req: Request, res: Response) => {
  const me = await updateMyName(req.user!.id, (req.body as { name: string }).name);
  res.json(me);
});
router.put("/me/avatar", singleImage("image", AVATAR_MAX_BYTES), async (req: Request, res: Response) => {
  res.json(await setAvatar(req.user!.id, uploadedImage(req)));
});
router.delete("/me/avatar", async (req: Request, res: Response) => {
  await removeAvatar(req.user!.id);
  res.status(204).end();
});
router.get("/:id/avatar", async (req: Request, res: Response) => {
  const avatar = await getAvatar(req.user!.id, req.params.id);
  res.setHeader("Content-Type", avatar.mimeType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.send(Buffer.from(avatar.data));
});

router.get("/assignable-faculty", authorize("ADMIN", "DEAN", "CHAIRMAN"), listAssignableFaculty);

router.get("/:id/prioritized-subjects", authorize("ADMIN", "DEAN", "CHAIRMAN"), getPrioritizedSubjects);
router.get("/:id", authorize("ADMIN"), getById);
router.post("/", authorize("ADMIN", "CHAIRMAN"), validate(createUserSchema), create);
router.patch("/:id", authorize("ADMIN", "CHAIRMAN"), validate(updateUserSchema), update);
router.delete("/:id", authorize("ADMIN"), remove);

router.post("/:id/restore", authorize("ADMIN"), restore);

export const userRoutes = router;