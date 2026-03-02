import { Router } from "express";
import { list, getById, create, update, remove, listTrash, restore, permanentDelete } from "./roomController.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { createRoomSchema, updateRoomSchema } from "./roomSchemas.js";

const router = Router();

router.use(authenticate);

// All room access: ADMIN, DEAN, CHAIRMAN, OFFICER (exclude FACULTY)
const roomAccessRoles = ["ADMIN", "DEAN", "CHAIRMAN", "OFFICER"] as const;

// Trash (must be before /:id)
router.get("/trash", authorize("ADMIN"), listTrash);
router.delete("/trash/:id", authorize("ADMIN"), permanentDelete);

router.get("/", authorize(...roomAccessRoles), list);
router.get("/:id", authorize(...roomAccessRoles), getById);
router.post("/", authorize(...roomAccessRoles), validate(createRoomSchema), create);
router.patch("/:id", authorize(...roomAccessRoles), validate(updateRoomSchema), update);
// Soft delete: only ADMIN and DEAN
router.delete("/:id", authorize("ADMIN", "DEAN"), remove);

// Restore from trash: ADMIN only
router.post("/:id/restore", authorize("ADMIN"), restore);

export const roomRoutes = router;