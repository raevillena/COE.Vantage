import { Router } from "express";
import { list, getById, create, update, remove, listTrash, restore, permanentDelete, getAvailability, setAvailability, getAvailabilityMap } from "./roomController.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { createRoomSchema, updateRoomSchema, setRoomAvailabilitySchema } from "./roomSchemas.js";

const router = Router();

router.use(authenticate);

// All room access: ADMIN, DEAN, CHAIRMAN, OFFICER (exclude FACULTY)
const roomAccessRoles = ["ADMIN", "DEAN", "CHAIRMAN", "OFFICER"] as const;
// Create and edit room details: ADMIN, DEAN, OFFICER only (chairman can only view and edit control)
const roomEditRoles = ["ADMIN", "DEAN", "OFFICER"] as const;

// Trash (must be before /:id)
router.get("/trash", authorize("ADMIN"), listTrash);
router.delete("/trash/:id", authorize("ADMIN"), permanentDelete);

router.get("/", authorize(...roomAccessRoles), list);
router.get("/availability-map", authorize(...roomAccessRoles), getAvailabilityMap);
router.get("/:id", authorize(...roomAccessRoles), getById);
router.get("/:id/availability", authorize(...roomAccessRoles), getAvailability);
router.patch("/:id/availability", authorize("ADMIN", "CHAIRMAN"), validate(setRoomAvailabilitySchema), setAvailability);
router.post("/", authorize(...roomEditRoles), validate(createRoomSchema), create);
router.patch("/:id", authorize(...roomAccessRoles), validate(updateRoomSchema), update);
// Soft delete: only ADMIN and DEAN
router.delete("/:id", authorize("ADMIN", "DEAN"), remove);

// Restore from trash: ADMIN only
router.post("/:id/restore", authorize("ADMIN"), restore);

export const roomRoutes = router;