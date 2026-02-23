import { Router } from "express";
import { login, refresh, logout, register } from "./authController.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { loginSchema, registerSchema } from "./authSchemas.js";

const router = Router();

router.post("/login", validate(loginSchema), login);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.post("/register", authenticate, authorize("ADMIN"), validate(registerSchema), register);

export const authRoutes = router;
