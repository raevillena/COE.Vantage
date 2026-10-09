import rateLimit from "express-rate-limit";

const windowMs = 15 * 60 * 1000;

/**
 * App-level throttling for unauthenticated public grade endpoints (defense in depth; pair with nginx later).
 * Uses `req.ip` — enable `TRUST_PROXY` in env when behind a reverse proxy so the client IP is correct.
 */
export const publicGradeLookupLimiter = rateLimit({
  windowMs,
  max: 80,
  message: { message: "Too many lookup attempts. Please wait and try again." },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Public compute updates the DB — keep a tighter cap than lookup. */
export const publicGradeComputeLimiter = rateLimit({
  windowMs,
  max: 30,
  message: { message: "Too many compute attempts. Please wait and try again." },
  standardHeaders: true,
  legacyHeaders: false,
});
