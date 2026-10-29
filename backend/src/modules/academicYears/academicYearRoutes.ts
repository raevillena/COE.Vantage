import { Router } from "express";
import { list, getById, getActive, listActive, listForSchedules, setCurrentTerm, setTermLock, create, update, remove, listTrash, restore, permanentDelete } from "./academicYearController.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { createAcademicYearSchema, setCurrentTermSchema, setTermLockSchema, updateAcademicYearSchema } from "./academicYearSchemas.js";

const router = Router();

router.use(authenticate);

router.get("/active", getActive);
router.get("/for-schedules", listForSchedules);

router.get("/trash", authorize("ADMIN"), listTrash);
router.delete("/trash/:id", authorize("ADMIN"), permanentDelete);

// The admin and the college secretary choose the current academic year and semester (the default of the filters).
router.put("/current-term", authorize("ADMIN", "COLLEGE_SECRETARY"), validate(setCurrentTermSchema), setCurrentTerm);

// The admin, dean and college secretary lock a semester so its schedules stop changing, and unlock it again.
router.put("/:id/term-lock", authorize("ADMIN", "DEAN", "COLLEGE_SECRETARY"), validate(setTermLockSchema), setTermLock);

router.get("/", authorize("ADMIN", "DEAN", "CHAIRMAN", "COLLEGE_SECRETARY"), list);
router.get("/:id", authorize("ADMIN", "DEAN", "CHAIRMAN", "COLLEGE_SECRETARY"), getById);
router.post("/", authorize("ADMIN", "COLLEGE_SECRETARY"), validate(createAcademicYearSchema), create);
router.patch("/:id", authorize("ADMIN", "COLLEGE_SECRETARY"), validate(updateAcademicYearSchema), update);
router.delete("/:id", authorize("ADMIN"), remove);

router.post("/:id/restore", authorize("ADMIN"), restore);

export const academicYearRoutes = router;