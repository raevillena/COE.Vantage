import { Router } from "express";
import { getExtensionAccess } from "./authService.js";
import {
  login,
  refresh,
  logout,
  register,
  requestPasswordReset,
  sendPasswordResetEmail,
  forgotPassword,
  resetPassword,
  getMyExperimentalFeatures,
  updateMyExperimentalFeatures,
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
  updateExperimentalFeaturesSchema,
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
router.post("/forgot-password", validate(sendPasswordResetEmailSchema), forgotPassword);
router.post("/reset-password", validate(resetPasswordSchema), resetPassword);
router.get("/me/experimental-features", authenticate, getMyExperimentalFeatures);
router.patch(
  "/me/experimental-features",
  authenticate,
  validate(updateExperimentalFeaturesSchema),
  updateMyExperimentalFeatures
);

// Read by the Portal Insert Grade browser extension with the person's Vantage login cookie (no bearer token).
router.get("/extension-access/mmsu-grade-push", async (req, res) => {
  const access = await getExtensionAccess(req.cookies?.refreshToken, "mmsuGradePush");
  res.setHeader("Cache-Control", "no-store");
  res.json(access);
});

export const authRoutes = router;
