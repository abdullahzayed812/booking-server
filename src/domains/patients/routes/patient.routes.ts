import { Router } from "express";
import { authenticateToken, requireRole, requirePermission } from "@/shared/middleware/auth.middleware";
import { validateBody, validateParams, validateQuery } from "@/shared/middleware/validation.middleware";
import { generalRateLimit, createResourceRateLimit } from "@/shared/middleware/rate-limit.middleware";
import { UserRole } from "@/shared/types/common.types";
import { Resource, Action } from "@/shared/types/auth.types";
import { PatientController } from "../controllers/patient.controller";
import {
  createPatientProfileSchema,
  updatePatientProfileSchema,
  updateEmergencyContactSchema,
  updateAllergiesSchema,
  updateMedicalHistorySchema,
  queryPatientsSchema,
  searchPatientsSchema,
  patientIdParamSchema,
} from "../validators/patient.validator";
import { tenantMiddleware } from "@/shared/middleware/tenant.middleware";

const router = Router();
const patientController = new PatientController();

// Routes that require tenant context
router.use(tenantMiddleware);

// Apply authentication to all routes
router.use(authenticateToken);

// Health check
router.get("/health", patientController.healthCheck);

// Patient statistics (admin only)
router.get("/stats", generalRateLimit, requireRole(UserRole.ADMIN), patientController.getPatientStats);

// Search patients
router.get(
  "/search",
  generalRateLimit,
  validateQuery(searchPatientsSchema),
  requirePermission(Resource.PATIENT, Action.READ),
  patientController.searchPatients
);

// Get patient by medical record number
router.get(
  "/by-mrn/:medicalRecordNumber",
  generalRateLimit,
  requirePermission(Resource.PATIENT, Action.READ),
  patientController.getPatientByMedicalRecordNumber
);

// Create patient profile (admin only)
router.post(
  "/profile",
  createResourceRateLimit,
  requireRole(UserRole.ADMIN),
  validateBody(createPatientProfileSchema),
  patientController.createPatientProfile
);

// Get all patients with filters
router.get(
  "/",
  generalRateLimit,
  validateQuery(queryPatientsSchema),
  requirePermission(Resource.PATIENT, Action.READ),
  patientController.getPatients
);

// Get specific patient profile
router.get(
  "/:id",
  generalRateLimit,
  validateParams(patientIdParamSchema),
  requirePermission(Resource.PATIENT, Action.READ),
  patientController.getPatientProfile
);

// Update patient profile
router.put(
  "/:id",
  generalRateLimit,
  validateParams(patientIdParamSchema),
  validateBody(updatePatientProfileSchema),
  requirePermission(Resource.PATIENT, Action.UPDATE),
  patientController.updatePatientProfile
);

// Update emergency contact
router.put(
  "/:id/emergency-contact",
  generalRateLimit,
  validateParams(patientIdParamSchema),
  validateBody(updateEmergencyContactSchema),
  requirePermission(Resource.PATIENT, Action.UPDATE),
  patientController.updateEmergencyContact
);

// Update allergies
router.put(
  "/:id/allergies",
  generalRateLimit,
  validateParams(patientIdParamSchema),
  validateBody(updateAllergiesSchema),
  requirePermission(Resource.PATIENT, Action.UPDATE),
  patientController.updateAllergies
);

// Update medical history
router.put(
  "/:id/medical-history",
  generalRateLimit,
  validateParams(patientIdParamSchema),
  validateBody(updateMedicalHistorySchema),
  requirePermission(Resource.PATIENT, Action.UPDATE),
  patientController.updateMedicalHistory
);

export { router as patientRoutes };
