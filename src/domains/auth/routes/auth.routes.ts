import { Router } from "express";
import rateLimit from "express-rate-limit";
import { config } from "@/shared/config/environment";
import { authenticateToken } from "@/shared/middleware/auth.middleware";
import { tenantMiddleware } from "@/shared/middleware/tenant.middleware";
import { AuthController } from "../controllers/auth.controller";
import {
  validateRequest,
  validateParams,
  registerSchema,
  loginSchema,
  changePasswordSchema,
  refreshTokenSchema,
  sessionIdParamSchema,
} from "../validators/auth.validator";

const router = Router();
const authController = new AuthController();

// Rate limiting configurations
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    success: false,
    message: "Too many authentication attempts, please try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalRateLimit = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    success: false,
    message: "Too many requests, please try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public routes (no tenant required)
router.get("/health", authController.healthCheck);

// Routes that require tenant context
router.use(tenantMiddleware);

// Public authentication routes
router.post("/register", authRateLimit, validateRequest(registerSchema), authController.register);

router.post("/login", validateRequest(loginSchema), authController.login);

router.post("/refresh", generalRateLimit, validateRequest(refreshTokenSchema), authController.refreshToken);

// Protected routes (require authentication)
router.use(authenticateToken);

router.post("/logout", generalRateLimit, authController.logout);

router.get("/me", generalRateLimit, authController.getCurrentUser);

router.get("/validate", generalRateLimit, authController.validateToken);

router.put("/change-password", authRateLimit, validateRequest(changePasswordSchema), authController.changePassword);

// Session management routes
router.get("/sessions", generalRateLimit, authController.getUserSessions);

router.delete(
  "/sessions/:sessionId",
  generalRateLimit,
  validateParams(sessionIdParamSchema),
  authController.revokeSession
);

export { router as authRoutes };
