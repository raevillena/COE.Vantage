import { Router } from "express";
import { getExtensionAccess } from "./authService.js";
import {
  login,
  mySessions,
  endMySession,
  endOtherSessionsOfMe,
  myLoginHistoryList,
  loginEventsForAdmin,
  getEmailDigest,
  setEmailDigest,
  getEmailPreferences,
  setEmailPreferences,
  googleConfig,
  googleLogin,
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
  emailDigestSchema,
  emailPreferencesSchema,
  googleLoginSchema,
  loginSchema,
  registerSchema,
  requestPasswordResetSchema,
  sendPasswordResetEmailSchema,
  resetPasswordSchema,
  updateExperimentalFeaturesSchema,
} from "./authSchemas.js";

const router = Router();

router.post("/login", validate(loginSchema), login);
router.get("/google/config", googleConfig);
router.post("/google", validate(googleLoginSchema), googleLogin);
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
router.get("/me/sessions", authenticate, mySessions);
router.post("/me/sessions/revoke-others", authenticate, endOtherSessionsOfMe);
router.delete("/me/sessions/:id", authenticate, endMySession);
router.get("/me/login-history", authenticate, myLoginHistoryList);
router.get("/login-events", authenticate, authorize("ADMIN"), loginEventsForAdmin);
router.get("/me/email-preferences", authenticate, getEmailPreferences);
router.patch("/me/email-preferences", authenticate, validate(emailPreferencesSchema), setEmailPreferences);
router.get("/me/email-digest", authenticate, getEmailDigest);
router.patch("/me/email-digest", authenticate, validate(emailDigestSchema), setEmailDigest);
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
