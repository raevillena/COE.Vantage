import { Router } from "express";
import { list, getById, create, update, remove } from "./userController.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { createUserSchema, updateUserSchema } from "./userSchemas.js";

const router = Router();

router.use(authenticate);
router.use(authorize("ADMIN"));

router.get("/", list);
router.get("/:id", getById);
router.post("/", validate(createUserSchema), create);
router.patch("/:id", validate(updateUserSchema), update);
router.delete("/:id", remove);

export const userRoutes = router;