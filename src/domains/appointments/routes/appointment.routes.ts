import { Router } from "express";
import { authenticateToken, requireRole, requirePermission } from "@/shared/middleware/auth.middleware";
import { validateBody, validateParams, validateQuery } from "@/shared/middleware/validation.middleware";
import { tenantMiddleware } from "@/shared/middleware/tenant.middleware";
import { generalRateLimit, createResourceRateLimit } from "@/shared/middleware/rate-limit.middleware";
import { UserRole } from "@/shared/types/common.types";
import { Action, Resource } from "@/shared/types/auth.types";
import { AppointmentController } from "../controllers/appointment.controller";
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  cancelAppointmentSchema,
  queryAppointmentsSchema,
  appointmentIdParamSchema,
  doctorIdParamSchema,
  availableSlotsSchema,
  nextAvailableSlotSchema,
} from "../validators/appointment.validator";

const router = Router();
const appointmentController = new AppointmentController();

// Routes that require tenant context
router.use(tenantMiddleware);

// Apply authentication to all routes
router.use(authenticateToken);

// Health check
router.get("/health", appointmentController.healthCheck);

// Get dashboard stats - must come before generic routes
router.get(
  "/stats",
  generalRateLimit,
  requirePermission(Resource.APPOINTMENT, Action.READ),
  appointmentController.getDashboardStats
);

// Create appointment
router.post(
  "/",
  createResourceRateLimit,
  validateBody(createAppointmentSchema),
  requirePermission(Resource.APPOINTMENT, Action.CREATE),
  appointmentController.createAppointment
);

// Get appointments with filters
router.get(
  "/",
  generalRateLimit,
  validateQuery(queryAppointmentsSchema),
  requirePermission(Resource.APPOINTMENT, Action.READ),
  appointmentController.getAppointments
);

// Get upcoming appointments
router.get(
  "/upcoming",
  generalRateLimit,
  requirePermission(Resource.APPOINTMENT, Action.READ),
  appointmentController.getUpcomingAppointments
);

// Get specific appointment
router.get(
  "/:id",
  generalRateLimit,
  validateParams(appointmentIdParamSchema),
  requirePermission(Resource.APPOINTMENT, Action.READ),
  appointmentController.getAppointment
);

// Update appointment
router.put(
  "/:id",
  generalRateLimit,
  validateParams(appointmentIdParamSchema),
  validateBody(updateAppointmentSchema),
  requirePermission(Resource.APPOINTMENT, Action.UPDATE),
  appointmentController.updateAppointment
);

// Cancel appointment
router.post(
  "/:id/cancel",
  generalRateLimit,
  validateParams(appointmentIdParamSchema),
  validateBody(cancelAppointmentSchema),
  requirePermission(Resource.APPOINTMENT, Action.UPDATE),
  appointmentController.cancelAppointment
);

// Confirm appointment
router.post(
  "/:id/confirm",
  generalRateLimit,
  validateParams(appointmentIdParamSchema),
  requirePermission(Resource.APPOINTMENT, Action.UPDATE),
  appointmentController.confirmAppointment
);

// Start appointment (doctors only)
router.post(
  "/:id/start",
  generalRateLimit,
  validateParams(appointmentIdParamSchema),
  requireRole(UserRole.DOCTOR, UserRole.ADMIN),
  requirePermission(Resource.APPOINTMENT, Action.UPDATE),
  appointmentController.startAppointment
);

// Complete appointment (doctors only)
router.post(
  "/:id/complete",
  generalRateLimit,
  validateParams(appointmentIdParamSchema),
  requireRole(UserRole.DOCTOR, UserRole.ADMIN),
  requirePermission(Resource.APPOINTMENT, Action.UPDATE),
  appointmentController.completeAppointment
);

// Mark as no-show (doctors only)
router.post(
  "/:id/no-show",
  generalRateLimit,
  validateParams(appointmentIdParamSchema),
  requireRole(UserRole.DOCTOR, UserRole.ADMIN),
  requirePermission(Resource.APPOINTMENT, Action.UPDATE),
  appointmentController.markNoShow
);

// Get available slots for a doctor
router.get(
  "/doctors/:doctorId/available-slots",
  generalRateLimit,
  validateParams(doctorIdParamSchema),
  validateQuery(availableSlotsSchema),
  requirePermission(Resource.APPOINTMENT, Action.READ),
  appointmentController.getAvailableSlots
);

// Get next available slot for a doctor
router.get(
  "/doctors/:doctorId/next-available",
  generalRateLimit,
  validateParams(doctorIdParamSchema),
  validateQuery(nextAvailableSlotSchema),
  requirePermission(Resource.APPOINTMENT, Action.READ),
  appointmentController.getNextAvailableSlot
);

export { router as appointmentRoutes };
