import { Router } from "express";
import { list, getById, create, update, remove } from "./roomController.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { createRoomSchema, updateRoomSchema } from "./roomSchemas.js";

const router = Router();

router.use(authenticate);
router.use(authorize("ADMIN", "DEAN", "CHAIRMAN"));

router.get("/", list);
router.get("/:id", getById);
router.post("/", validate(createRoomSchema), authorize("ADMIN"), create);
router.patch("/:id", validate(updateRoomSchema), authorize("ADMIN"), update);
router.delete("/:id", authorize("ADMIN"), remove);

export const roomRoutes = router;