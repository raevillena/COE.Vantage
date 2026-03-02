import { Router } from "express";
import {
  login,
  refresh,
  logout,
  register,
  requestPasswordReset,
  sendPasswordResetEmail,
  resetPassword,
} from "./authController.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import {
  loginSchema,
  registerSchema,
  requestPasswordResetSchema,
  sendPasswordResetEmailSchema,
  resetPasswordSchema,
} from "./authSchemas.js";

const router = Router();

router.post("/login", validate(loginSchema), login);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.post("/register", authenticate, authorize("ADMIN"), validate(registerSchema), register);
router.post(
  "/request-password-reset",
  authenticate,
  validate(requestPasswordResetSchema),
  requestPasswordReset
);
router.post(
  "/send-password-reset-email",
  authenticate,
  authorize("ADMIN"),
  validate(sendPasswordResetEmailSchema),
  sendPasswordResetEmail
);
router.post("/reset-password", validate(resetPasswordSchema), resetPassword);

export const authRoutes = router;
