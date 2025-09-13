import { Request, Response, NextFunction } from "express";
// import { createModuleLogger } from '@/shared/config/logger';
import { sendSuccess, sendCreated, sendError, sendPaginatedResponse } from "@/shared/utils/response";
import { PatientService, CreatePatientProfileRequest, UpdatePatientProfileRequest } from "../services/patient.service";
import { PatientRepository } from "../repositories/patient.repository";

// const moduleLogger = createModuleLogger('PatientController');

export class PatientController {
  private patientService: PatientService;

  constructor() {
    const patientRepository = new PatientRepository();
    this.patientService = new PatientService(patientRepository);
  }

  createPatientProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const profileData: CreatePatientProfileRequest = req.body;
      const tenantId = req.tenantId!;
      const createdBy = req.user!.id;

      const patient = await this.patientService.createPatientProfile(profileData, tenantId, createdBy);

      sendCreated(res, patient, "Patient profile created successfully");
    } catch (error) {
      next(error);
    }
  };

  getPatients = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenantId!;

      const filters = {
        isActive: req.query["isActive"] !== "false", // Default to true
        searchTerm: req.query["searchTerm"] as string,
        limit: parseInt(req.query["limit"] as string) || 20,
        offset: ((parseInt(req.query["page"] as string) || 1) - 1) * (parseInt(req.query["limit"] as string) || 20),
      };

      const result = await this.patientService.getPatients(tenantId, filters);

      const page = parseInt(req.query["page"] as string) || 1;
      const limit = parseInt(req.query["limit"] as string) || 20;

      sendPaginatedResponse(res, result.patients, page, limit, result.total, "Patients retrieved successfully");
    } catch (error) {
      next(error);
    }
  };

  getPatientProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;

      if (!id) {
        return sendError(res, "Patient ID not found", 404);
      }

      const patient = await this.patientService.getPatientProfile(id, tenantId);

      if (!patient) {
        return sendError(res, "Patient not found", 404);
      }

      sendSuccess(res, patient, "Patient profile retrieved successfully");
    } catch (error) {
      next(error);
    }
  };

  updatePatientProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const updateData: UpdatePatientProfileRequest = req.body;
      const tenantId = req.tenantId!;
      const updatedBy = req.user!.id;

      if (!id) {
        return sendError(res, "Patient ID not found", 404);
      }

      const patient = await this.patientService.updatePatientProfile(id, updateData, tenantId, updatedBy);

      sendSuccess(res, patient, "Patient profile updated successfully");
    } catch (error) {
      next(error);
    }
  };

  searchPatients = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { q } = req.query;
      const tenantId = req.tenantId!;
      const limit = parseInt(req.query["limit"] as string) || 20;

      const patients = await this.patientService.searchPatients(q as string, tenantId, limit);

      sendSuccess(res, { patients, query: q, count: patients.length }, "Search results retrieved successfully");
    } catch (error) {
      next(error);
    }
  };

  getPatientByMedicalRecordNumber = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { medicalRecordNumber } = req.params;
      const tenantId = req.tenantId!;

      if (!medicalRecordNumber) {
        return sendError(res, "Medical record number not found", 404);
      }

      const patient = await this.patientService.getPatientByMedicalRecordNumber(
        decodeURIComponent(medicalRecordNumber),
        tenantId
      );

      if (!patient) {
        return sendError(res, "Patient not found", 404);
      }

      sendSuccess(res, patient, "Patient retrieved successfully");
    } catch (error) {
      next(error);
    }
  };

  updateEmergencyContact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { emergencyContactName, emergencyContactPhone } = req.body;
      const tenantId = req.tenantId!;
      const updatedBy = req.user!.id;

      if (!id) {
        return sendError(res, "Patient ID not found", 404);
      }

      await this.patientService.updateEmergencyContact(
        id,
        emergencyContactName,
        emergencyContactPhone,
        tenantId,
        updatedBy
      );

      sendSuccess(res, undefined, "Emergency contact updated successfully");
    } catch (error) {
      next(error);
    }
  };

  updateAllergies = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { allergies } = req.body;
      const tenantId = req.tenantId!;
      const updatedBy = req.user!.id;

      if (!id) {
        return sendError(res, "Patient ID not found", 404);
      }

      await this.patientService.updateAllergies(id, allergies, tenantId, updatedBy);

      sendSuccess(res, undefined, "Allergies updated successfully");
    } catch (error) {
      next(error);
    }
  };

  updateMedicalHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { medicalHistory } = req.body;
      const tenantId = req.tenantId!;
      const updatedBy = req.user!.id;

      if (!id) {
        return sendError(res, "Patient ID not found not found", 404);
      }

      await this.patientService.updateMedicalHistory(id, medicalHistory, tenantId, updatedBy);

      sendSuccess(res, undefined, "Medical history updated successfully");
    } catch (error) {
      next(error);
    }
  };

  getPatientStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenantId!;

      const stats = await this.patientService.getPatientStats(tenantId);

      sendSuccess(res, stats, "Patient statistics retrieved successfully");
    } catch (error) {
      next(error);
    }
  };

  /**
   * Health check for patients service
   */
  healthCheck = async (req: Request, res: Response): Promise<void> => {
    sendSuccess(
      res,
      {
        service: "patients",
        status: "healthy",
        timestamp: new Date(),
      },
      "Patients service is healthy"
    );
  };
}
