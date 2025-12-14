import { Router } from "express";
import { getDashboardStats, getAppointmentTrends } from "../controllers/analytics.controller";
import { authenticateToken, requireRole } from "../../../shared/middleware/auth.middleware";
import { UserRole } from "../../../shared/types/common.types";

const router = Router();

router.use(authenticateToken);

router.get("/dashboard", requireRole(UserRole.ADMIN, UserRole.DOCTOR), getDashboardStats);
router.get("/trends", requireRole(UserRole.ADMIN), getAppointmentTrends);

export const analyticsRoutes = router;
