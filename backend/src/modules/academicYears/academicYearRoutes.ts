import { Router } from "express";
import { list, getById, getActive, create, update, remove } from "./academicYearController.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { createAcademicYearSchema, updateAcademicYearSchema } from "./academicYearSchemas.js";

const router = Router();

router.use(authenticate);

router.get("/active", getActive);
router.get("/", authorize("ADMIN", "DEAN", "CHAIRMAN"), list);
router.get("/:id", authorize("ADMIN", "DEAN", "CHAIRMAN"), getById);
router.post("/", authorize("ADMIN"), validate(createAcademicYearSchema), create);
router.patch("/:id", authorize("ADMIN"), validate(updateAcademicYearSchema), update);
router.delete("/:id", authorize("ADMIN"), remove);

export const academicYearRoutes = router;