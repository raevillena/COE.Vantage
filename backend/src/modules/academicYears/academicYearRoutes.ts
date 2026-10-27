import { Router } from "express";
import { list, getById, getActive, listActive, listForSchedules, setCurrentTerm, create, update, remove, listTrash, restore, permanentDelete } from "./academicYearController.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { createAcademicYearSchema, setCurrentTermSchema, updateAcademicYearSchema } from "./academicYearSchemas.js";

const router = Router();

router.use(authenticate);

router.get("/active", getActive);
router.get("/for-schedules", listForSchedules);

router.get("/trash", authorize("ADMIN"), listTrash);
router.delete("/trash/:id", authorize("ADMIN"), permanentDelete);

// The admin and the college secretary choose the current academic year and semester (the default of the filters).
router.put("/current-term", authorize("ADMIN", "COLLEGE_SECRETARY"), validate(setCurrentTermSchema), setCurrentTerm);

router.get("/", authorize("ADMIN", "DEAN", "CHAIRMAN", "COLLEGE_SECRETARY"), list);
router.get("/:id", authorize("ADMIN", "DEAN", "CHAIRMAN", "COLLEGE_SECRETARY"), getById);
router.post("/", authorize("ADMIN"), validate(createAcademicYearSchema), create);
router.patch("/:id", authorize("ADMIN"), validate(updateAcademicYearSchema), update);
router.delete("/:id", authorize("ADMIN"), remove);

router.post("/:id/restore", authorize("ADMIN"), restore);

export const academicYearRoutes = router;