import { Router } from "express";
import { list, getById, create, update, remove } from "./userController.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { createUserSchema, updateUserSchema } from "./userSchemas.js";

const router = Router();

router.use(authenticate);

/** List users: ADMIN can list all; CHAIRMAN, DEAN, and FACULTY can list when filtering by role=FACULTY (for schedule dropdowns). */
router.get(
  "/",
  (req, res, next) => {
    const isAdmin = req.user?.role === "ADMIN";
    const isFacultyOnlyList =
      req.query.role === "FACULTY" &&
      (req.user?.role === "CHAIRMAN" || req.user?.role === "DEAN" || req.user?.role === "FACULTY");
    if (isAdmin || isFacultyOnlyList) return next();
    return authorize("ADMIN")(req, res, next);
  },
  list
);
router.get("/:id", authorize("ADMIN"), getById);
router.post("/", authorize("ADMIN"), validate(createUserSchema), create);
router.patch("/:id", authorize("ADMIN"), validate(updateUserSchema), update);
router.delete("/:id", authorize("ADMIN"), remove);

export const userRoutes = router;