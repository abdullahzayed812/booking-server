import { Router } from "express";
import { authenticateToken, requireRole, requirePermission } from "@/shared/middleware/auth.middleware";
import { generalRateLimit, createResourceRateLimit } from "@/shared/middleware/rate-limit.middleware";
import { UserRole } from "@/shared/types/common.types";
import { Action, Resource } from "@/shared/types/auth.types";
import { MedicalNoteController } from "../controllers/medical-note.controller";

const router = Router();
const medicalNoteController = new MedicalNoteController();

// Apply authentication to all routes
router.use(authenticateToken);

// Health check
router.get("/health", medicalNoteController.healthCheck);

// Medical note statistics (admin only)
router.get("/stats", generalRateLimit, requireRole(UserRole.ADMIN), medicalNoteController.getMedicalNoteStats);

// Search medical notes
router.get(
  "/search",
  generalRateLimit,
  requirePermission(Resource.MEDICAL_NOTE, Action.READ),
  medicalNoteController.searchMedicalNotes
);

// Get medical note by appointment
router.get(
  "/appointment/:appointmentId",
  generalRateLimit,
  requirePermission(Resource.MEDICAL_NOTE, Action.READ),
  medicalNoteController.getMedicalNoteByAppointment
);

// Create medical note (doctors only)
router.post(
  "/",
  createResourceRateLimit,
  requireRole(UserRole.DOCTOR, UserRole.ADMIN),
  requirePermission(Resource.MEDICAL_NOTE, Action.CREATE),
  medicalNoteController.createMedicalNote
);

// Get all medical notes with filters
router.get(
  "/",
  generalRateLimit,
  requirePermission(Resource.MEDICAL_NOTE, Action.READ),
  medicalNoteController.getMedicalNotes
);

// Get specific medical note
router.get(
  "/:id",
  generalRateLimit,
  requirePermission(Resource.MEDICAL_NOTE, Action.READ),
  medicalNoteController.getMedicalNote
);

// Update medical note (doctors only)
router.put(
  "/:id",
  generalRateLimit,
  requireRole(UserRole.DOCTOR, UserRole.ADMIN),
  requirePermission(Resource.MEDICAL_NOTE, Action.UPDATE),
  medicalNoteController.updateMedicalNote
);

// Delete medical note (doctors and admins only)
router.delete(
  "/:id",
  generalRateLimit,
  requireRole(UserRole.DOCTOR, UserRole.ADMIN),
  requirePermission(Resource.MEDICAL_NOTE, Action.DELETE),
  medicalNoteController.deleteMedicalNote
);

export { router as medicalNoteRoutes };
