import { Router } from "express";
import { authenticateToken, requireRole, requirePermission } from "@/shared/middleware/auth.middleware";
import { validateBody, validateParams, validateQuery } from "@/shared/middleware/validation.middleware";
import { generalRateLimit, createResourceRateLimit } from "@/shared/middleware/rate-limit.middleware";
import { UserRole } from "@/shared/types/common.types";
import { Action, Resource } from "@/shared/types/auth.types";
import { DoctorController } from "../controllers/doctor.controller";
import {
  createDoctorProfileSchema,
  updateDoctorProfileSchema,
  setWeeklyScheduleSchema,
  createAvailabilityOverrideSchema,
  queryDoctorsSchema,
  getAvailabilityOverridesSchema,
  doctorIdParamSchema,
  overrideIdParamSchema,
} from "../validators/doctor.validator";

const router = Router();
const doctorController = new DoctorController();

// Apply authentication to all routes
router.use(authenticateToken);

// Health check
router.get("/health", doctorController.healthCheck);

// Doctor statistics (admin only)
router.get("/stats", generalRateLimit, requireRole(UserRole.ADMIN), doctorController.getDoctorStats);

// Get all specializations
router.get(
  "/specializations",
  generalRateLimit,
  requirePermission(Resource.DOCTOR, Action.READ),
  doctorController.getSpecializations
);

// Get doctors by specialization
router.get(
  "/by-specialization/:specialization",
  generalRateLimit,
  requirePermission(Resource.DOCTOR, Action.READ),
  doctorController.getDoctorsBySpecialization
);

// Create doctor profile (admin only)
router.post(
  "/profile",
  createResourceRateLimit,
  requireRole(UserRole.ADMIN),
  validateBody(createDoctorProfileSchema),
  doctorController.createDoctorProfile
);

// Get all doctors with filters
router.get(
  "/",
  generalRateLimit,
  validateQuery(queryDoctorsSchema),
  requirePermission(Resource.DOCTOR, Action.READ),
  doctorController.getDoctors
);

// Get specific doctor profile
router.get(
  "/:id",
  generalRateLimit,
  validateParams(doctorIdParamSchema),
  requirePermission(Resource.DOCTOR, Action.READ),
  doctorController.getDoctorProfile
);

// Update doctor profile
router.put(
  "/:id",
  generalRateLimit,
  validateParams(doctorIdParamSchema),
  validateBody(updateDoctorProfileSchema),
  requirePermission(Resource.DOCTOR, Action.UPDATE),
  doctorController.updateDoctorProfile
);

// Toggle appointment acceptance
router.post(
  "/:id/toggle-accepting",
  generalRateLimit,
  validateParams(doctorIdParamSchema),
  requirePermission(Resource.DOCTOR, Action.UPDATE),
  doctorController.toggleAcceptingAppointments
);

// Availability management routes

// Get doctor availability
router.get(
  "/:id/availability",
  generalRateLimit,
  validateParams(doctorIdParamSchema),
  requirePermission(Resource.AVAILABILITY, Action.READ),
  doctorController.getDoctorAvailability
);

// Set weekly schedule
router.put(
  "/:id/availability",
  generalRateLimit,
  validateParams(doctorIdParamSchema),
  validateBody(setWeeklyScheduleSchema),
  requirePermission(Resource.AVAILABILITY, Action.UPDATE),
  doctorController.setWeeklySchedule
);

// Get availability overrides
router.get(
  "/:id/availability/overrides",
  generalRateLimit,
  validateParams(doctorIdParamSchema),
  validateQuery(getAvailabilityOverridesSchema),
  requirePermission(Resource.AVAILABILITY, Action.READ),
  doctorController.getAvailabilityOverrides
);

// Create availability override
router.post(
  "/:id/availability/overrides",
  generalRateLimit,
  validateParams(doctorIdParamSchema),
  validateBody(createAvailabilityOverrideSchema),
  requirePermission(Resource.AVAILABILITY, Action.CREATE),
  doctorController.createAvailabilityOverride
);

// Delete availability override
router.delete(
  "/:id/availability/overrides/:overrideId",
  generalRateLimit,
  validateParams(doctorIdParamSchema),
  validateParams(overrideIdParamSchema),
  requirePermission(Resource.AVAILABILITY, Action.DELETE),
  doctorController.deleteAvailabilityOverride
);

export { router as doctorRoutes };
