import { Router } from "express";
import { list, getById, create, update, remove, listTrash, restore, permanentDelete, getPrioritizedFaculty, putPrioritizedFaculty, copyPrioritizedFaculty, getSubjectRooms, putSubjectRooms } from "./subjectController.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize, readOnly } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { createSubjectSchema, updateSubjectSchema, putPrioritizedFacultySchema, copyPrioritizedFacultySchema, putSubjectRoomsSchema } from "./subjectSchemas.js";

const router = Router();

router.use(authenticate);
router.use(authorize("ADMIN", "DEAN", "CHAIRMAN", "COLLEGE_SECRETARY"));
router.use(readOnly("COLLEGE_SECRETARY"));

router.get("/trash", authorize("ADMIN"), listTrash);
router.delete("/trash/:id", authorize("ADMIN"), permanentDelete);

router.get("/", list);
router.post("/prioritized-faculty/copy", authorize("ADMIN", "CHAIRMAN"), validate(copyPrioritizedFacultySchema), copyPrioritizedFaculty);
router.get("/:id/rooms", getSubjectRooms);
router.put("/:id/rooms", authorize("ADMIN", "CHAIRMAN"), validate(putSubjectRoomsSchema), putSubjectRooms);
router.get("/:id/prioritized-faculty", getPrioritizedFaculty);
router.put("/:id/prioritized-faculty", authorize("ADMIN", "CHAIRMAN"), validate(putPrioritizedFacultySchema), putPrioritizedFaculty);
router.get("/:id", getById);
router.post("/", validate(createSubjectSchema), create);
router.patch("/:id", validate(updateSubjectSchema), update);
router.delete("/:id", remove);

router.post("/:id/restore", authorize("ADMIN"), restore);

export const subjectRoutes = router;