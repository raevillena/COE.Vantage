import { Router } from "express";
import { list, getById, create, update, remove, listTrash, restore, permanentDelete, applyImport, getCurriculumSubjects, clearCurriculum, listSpecializations, createSpecialization, updateSpecialization, deleteSpecialization, setSubjectSpecializations } from "./curriculumController.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize, readOnly } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { createCurriculumSchema, updateCurriculumSchema, applyImportSchema, specializationSchema, setSubjectSpecializationsSchema } from "./curriculumSchemas.js";

const router = Router();

router.use(authenticate);
router.use(authorize("ADMIN", "OFFICER", "DEAN", "CHAIRMAN", "COLLEGE_SECRETARY"));
router.use(readOnly("COLLEGE_SECRETARY"));

router.get("/trash", authorize("ADMIN"), listTrash);
router.delete("/trash/:id", authorize("ADMIN"), permanentDelete);

router.get("/", list);
router.get("/:id/subjects", getCurriculumSubjects);
router.get("/:id/specializations", listSpecializations);
router.post("/:id/specializations", authorize("ADMIN", "CHAIRMAN"), validate(specializationSchema), createSpecialization);
router.patch("/specializations/:specId", authorize("ADMIN", "CHAIRMAN"), validate(specializationSchema), updateSpecialization);
router.delete("/specializations/:specId", authorize("ADMIN", "CHAIRMAN"), deleteSpecialization);
router.put("/:id/subjects/:subjectId/specializations", authorize("ADMIN", "CHAIRMAN"), validate(setSubjectSpecializationsSchema), setSubjectSpecializations);
router.post("/:id/clear", authorize("ADMIN", "CHAIRMAN"), clearCurriculum);
router.get("/:id", getById);
router.post("/", authorize("ADMIN", "CHAIRMAN"), validate(createCurriculumSchema), create);
router.patch("/:id", authorize("ADMIN", "CHAIRMAN"), validate(updateCurriculumSchema), update);
router.delete("/:id", authorize("ADMIN", "CHAIRMAN"), remove);

router.post("/:id/restore", authorize("ADMIN"), restore);

router.post("/apply-import", authorize("ADMIN", "CHAIRMAN"), validate(applyImportSchema), applyImport);

export const curriculumRoutes = router;