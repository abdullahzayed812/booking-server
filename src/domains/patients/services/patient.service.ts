import { createModuleLogger } from "@/shared/config/logger";
import { NotFoundError, ValidationError } from "@/shared/types/common.types";
import { eventBus, EventTypes } from "@/shared/events/event-bus";
import { PatientRepository } from "../repositories/patient.repository";
import { PatientEntity, PatientWithUser, CreatePatientData, UpdatePatientData } from "../models/patient.model";

const moduleLogger = createModuleLogger("PatientService");

export interface CreatePatientProfileRequest {
  userId: string;
  medicalRecordNumber?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  bloodType?: string;
  allergies?: string;
  medicalHistory?: string;
}

export interface UpdatePatientProfileRequest {
  medicalRecordNumber?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  bloodType?: string;
  allergies?: string;
  medicalHistory?: string;
}

export class PatientService {
  constructor(private patientRepository: PatientRepository) {}

  async createPatientProfile(
    request: CreatePatientProfileRequest,
    tenantId: string,
    createdBy: string
  ): Promise<PatientWithUser> {
    try {
      // Validate input
      this.validateCreatePatientRequest(request);

      // Create patient data
      const patientData: CreatePatientData = {
        tenantId,
        userId: request.userId,
        medicalRecordNumber: request.medicalRecordNumber?.trim(),
        emergencyContactName: request.emergencyContactName?.trim(),
        emergencyContactPhone: request.emergencyContactPhone?.trim(),
        bloodType: request.bloodType?.trim(),
        allergies: request.allergies?.trim(),
        medicalHistory: request.medicalHistory?.trim(),
      };

      // Create patient profile
      const patient = await this.patientRepository.create(patientData);

      // Get patient with user details
      const patientWithDetails = await this.patientRepository.findWithUserDetails(patient.id, tenantId);
      if (!patientWithDetails) {
        throw new Error("Failed to retrieve created patient profile");
      }

      // Publish domain event
      const patientCreatedEvent = eventBus.createEvent(
        EventTypes.PATIENT_CREATED,
        tenantId,
        patient.id,
        "patient",
        {
          patientId: patient.id,
          userId: request.userId,
          action: "created",
        },
        1,
        createdBy
      );

      await eventBus.publish(patientCreatedEvent);

      moduleLogger.info(
        {
          patientId: patient.id,
          userId: request.userId,
          tenantId,
          createdBy,
        },
        "Patient profile created successfully"
      );

      return patientWithDetails;
    } catch (error: any) {
      moduleLogger.error("Error creating patient profile:", error);
      throw error;
    }
  }

  async updatePatientProfile(
    patientId: string,
    request: UpdatePatientProfileRequest,
    tenantId: string,
    updatedBy: string
  ): Promise<PatientWithUser> {
    try {
      // Validate input
      this.validateUpdatePatientRequest(request);

      // Check if patient exists
      const existingPatient = await this.patientRepository.findById(patientId, tenantId);
      if (!existingPatient) {
        throw new NotFoundError("Patient not found");
      }

      // Prepare update data
      const updateData: UpdatePatientData = {};

      if (request.medicalRecordNumber !== undefined) {
        updateData.medicalRecordNumber = request.medicalRecordNumber?.trim();
      }
      if (request.emergencyContactName !== undefined) {
        updateData.emergencyContactName = request.emergencyContactName?.trim();
      }
      if (request.emergencyContactPhone !== undefined) {
        updateData.emergencyContactPhone = request.emergencyContactPhone?.trim();
      }
      if (request.bloodType !== undefined) {
        updateData.bloodType = request.bloodType?.trim();
      }
      if (request.allergies !== undefined) {
        updateData.allergies = request.allergies?.trim();
      }
      if (request.medicalHistory !== undefined) {
        updateData.medicalHistory = request.medicalHistory?.trim();
      }

      // Update patient profile
      const updatedPatient = await this.patientRepository.update(patientId, updateData, tenantId);

      // Get updated patient with details
      const patientWithDetails = await this.patientRepository.findWithUserDetails(patientId, tenantId);
      if (!patientWithDetails) {
        throw new Error("Failed to retrieve updated patient profile");
      }

      // Publish domain event
      const patientUpdatedEvent = eventBus.createEvent(
        EventTypes.PATIENT_UPDATED,
        tenantId,
        patientId,
        "patient",
        {
          patientId,
          changes: updateData,
          action: "updated",
        },
        1,
        updatedBy
      );

      await eventBus.publish(patientUpdatedEvent);

      moduleLogger.info(
        {
          patientId,
          tenantId,
          updatedBy,
          changes: Object.keys(updateData),
        },
        "Patient profile updated successfully"
      );

      return patientWithDetails;
    } catch (error: any) {
      moduleLogger.error("Error updating patient profile:", error);
      throw error;
    }
  }

  async getPatientProfile(patientId: string, tenantId: string): Promise<PatientWithUser | null> {
    try {
      return await this.patientRepository.findWithUserDetails(patientId, tenantId);
    } catch (error: any) {
      moduleLogger.error("Error getting patient profile:", error);
      throw error;
    }
  }

  async getPatients(
    tenantId: string,
    filters?: {
      isActive?: boolean;
      searchTerm?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ patients: PatientWithUser[]; total: number }> {
    try {
      const patients = await this.patientRepository.findAll(tenantId, filters);

      return {
        patients,
        total: patients.length, // This should be a separate count query in production
      };
    } catch (error: any) {
      moduleLogger.error("Error getting patients:", error);
      throw error;
    }
  }

  async searchPatients(searchTerm: string, tenantId: string, limit?: number): Promise<PatientWithUser[]> {
    try {
      if (!searchTerm || searchTerm.trim().length < 2) {
        throw new ValidationError("Search term must be at least 2 characters long");
      }

      return await this.patientRepository.searchPatients(searchTerm.trim(), tenantId, limit);
    } catch (error: any) {
      moduleLogger.error("Error searching patients:", error);
      throw error;
    }
  }

  async getPatientByMedicalRecordNumber(
    medicalRecordNumber: string,
    tenantId: string
  ): Promise<PatientWithUser | null> {
    try {
      const patient = await this.patientRepository.findByMedicalRecordNumber(medicalRecordNumber, tenantId);
      if (!patient) {
        return null;
      }

      return await this.patientRepository.findWithUserDetails(patient.id, tenantId);
    } catch (error: any) {
      moduleLogger.error("Error getting patient by medical record number:", error);
      throw error;
    }
  }

  async updateEmergencyContact(
    patientId: string,
    contactName: string,
    contactPhone: string,
    tenantId: string,
    updatedBy: string
  ): Promise<PatientEntity> {
    try {
      // Validate emergency contact data
      if (!contactName || !contactPhone) {
        throw new ValidationError("Emergency contact name and phone are required");
      }

      if (contactName.length > 255) {
        throw new ValidationError("Emergency contact name cannot exceed 255 characters");
      }

      if (!this.isValidPhoneNumber(contactPhone)) {
        throw new ValidationError("Invalid emergency contact phone number format");
      }

      const patient = await this.patientRepository.findById(patientId, tenantId);
      if (!patient) {
        throw new NotFoundError("Patient not found");
      }

      patient.setEmergencyContact(contactName.trim(), contactPhone.trim());

      await this.patientRepository.update(
        patientId,
        {
          emergencyContactName: patient.getRawData().emergencyContactName,
          emergencyContactPhone: patient.getRawData().emergencyContactPhone,
        } as any,
        tenantId
      );

      moduleLogger.info(
        {
          patientId,
          tenantId,
          updatedBy,
        },
        "Patient emergency contact updated"
      );

      return patient;
    } catch (error: any) {
      moduleLogger.error("Error updating emergency contact:", error);
      throw error;
    }
  }

  async updateAllergies(
    patientId: string,
    allergies: string,
    tenantId: string,
    updatedBy: string
  ): Promise<PatientEntity> {
    try {
      if (allergies.length > 2000) {
        throw new ValidationError("Allergies information cannot exceed 2000 characters");
      }

      const patient = await this.patientRepository.findById(patientId, tenantId);
      if (!patient) {
        throw new NotFoundError("Patient not found");
      }

      patient.updateAllergies(allergies.trim());

      await this.patientRepository.update(patientId, { allergies: patient.getRawData().allergies } as any, tenantId);

      moduleLogger.info(
        {
          patientId,
          tenantId,
          updatedBy,
        },
        "Patient allergies updated"
      );

      return patient;
    } catch (error: any) {
      moduleLogger.error("Error updating allergies:", error);
      throw error;
    }
  }

  async updateMedicalHistory(
    patientId: string,
    medicalHistory: string,
    tenantId: string,
    updatedBy: string
  ): Promise<PatientEntity> {
    try {
      if (medicalHistory.length > 5000) {
        throw new ValidationError("Medical history cannot exceed 5000 characters");
      }

      const patient = await this.patientRepository.findById(patientId, tenantId);
      if (!patient) {
        throw new NotFoundError("Patient not found");
      }

      patient.updateMedicalHistory(medicalHistory.trim());

      await this.patientRepository.update(
        patientId,
        { medicalHistory: patient.getRawData().medicalHistory } as any,
        tenantId
      );

      moduleLogger.info(
        {
          patientId,
          tenantId,
          updatedBy,
        },
        "Patient medical history updated"
      );

      return patient;
    } catch (error: any) {
      moduleLogger.error("Error updating medical history:", error);
      throw error;
    }
  }

  async getPatientStats(tenantId: string): Promise<any> {
    try {
      return await this.patientRepository.getStats(tenantId);
    } catch (error: any) {
      moduleLogger.error("Error getting patient stats:", error);
      throw error;
    }
  }

  // Private validation methods
  private validateCreatePatientRequest(request: CreatePatientProfileRequest): void {
    if (!request.userId) {
      throw new ValidationError("User ID is required");
    }

    if (request.medicalRecordNumber && request.medicalRecordNumber.length > 50) {
      throw new ValidationError("Medical record number cannot exceed 50 characters");
    }

    if (request.emergencyContactName && request.emergencyContactName.length > 255) {
      throw new ValidationError("Emergency contact name cannot exceed 255 characters");
    }

    if (request.emergencyContactPhone && !this.isValidPhoneNumber(request.emergencyContactPhone)) {
      throw new ValidationError("Invalid emergency contact phone number format");
    }

    if (request.bloodType && !this.isValidBloodType(request.bloodType)) {
      throw new ValidationError("Invalid blood type");
    }

    if (request.allergies && request.allergies.length > 2000) {
      throw new ValidationError("Allergies information cannot exceed 2000 characters");
    }

    if (request.medicalHistory && request.medicalHistory.length > 5000) {
      throw new ValidationError("Medical history cannot exceed 5000 characters");
    }
  }

  private validateUpdatePatientRequest(request: UpdatePatientProfileRequest): void {
    if (
      request.medicalRecordNumber !== undefined &&
      request.medicalRecordNumber &&
      request.medicalRecordNumber.length > 50
    ) {
      throw new ValidationError("Medical record number cannot exceed 50 characters");
    }

    if (
      request.emergencyContactName !== undefined &&
      request.emergencyContactName &&
      request.emergencyContactName.length > 255
    ) {
      throw new ValidationError("Emergency contact name cannot exceed 255 characters");
    }

    if (
      request.emergencyContactPhone !== undefined &&
      request.emergencyContactPhone &&
      !this.isValidPhoneNumber(request.emergencyContactPhone)
    ) {
      throw new ValidationError("Invalid emergency contact phone number format");
    }

    if (request.bloodType !== undefined && request.bloodType && !this.isValidBloodType(request.bloodType)) {
      throw new ValidationError("Invalid blood type");
    }

    if (request.allergies !== undefined && request.allergies && request.allergies.length > 2000) {
      throw new ValidationError("Allergies information cannot exceed 2000 characters");
    }

    if (request.medicalHistory !== undefined && request.medicalHistory && request.medicalHistory.length > 5000) {
      throw new ValidationError("Medical history cannot exceed 5000 characters");
    }
  }

  private isValidPhoneNumber(phone: string): boolean {
    // Basic phone number validation - can be enhanced based on requirements
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ""));
  }

  private isValidBloodType(bloodType: string): boolean {
    const validBloodTypes = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
    return validBloodTypes.includes(bloodType.toUpperCase());
  }
}
