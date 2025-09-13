import { db } from "@/shared/config/database";
import { redis } from "@/shared/config/redis";
import { createModuleLogger } from "@/shared/config/logger";
import { CACHE_KEYS, NotFoundError, ConflictError } from "@/shared/types/common.types";
import { PatientEntity, PatientWithUser, CreatePatientData, UpdatePatientData } from "../models/patient.model";

const moduleLogger = createModuleLogger("PatientRepository");

export class PatientRepository {
  private readonly CACHE_TTL = 900; // 15 minutes

  async create(patientData: CreatePatientData): Promise<PatientEntity> {
    try {
      // Check if patient profile already exists for this user
      const existingPatient = await this.findByUserId(patientData.userId, patientData.tenantId);
      if (existingPatient) {
        throw new ConflictError("Patient profile already exists for this user");
      }

      const patientEntity = PatientEntity.create(patientData);
      const dbData = patientEntity.toDatabaseFormat();

      await db.query(
        `INSERT INTO patients (
          id, tenant_id, medical_record_number, emergency_contact_name,
          emergency_contact_phone, blood_type, allergies, medical_history
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          patientData.userId, // Use userId as the primary key
          dbData.tenant_id,
          dbData.medical_record_number,
          dbData.emergency_contact_name,
          dbData.emergency_contact_phone,
          dbData.blood_type,
          dbData.allergies,
          dbData.medical_history,
        ],
        patientData.tenantId
      );

      // Fetch the created patient
      const createdPatient = await this.findById(patientData.userId, patientData.tenantId);
      if (!createdPatient) {
        throw new Error("Failed to create patient profile");
      }

      moduleLogger.info(
        {
          patientId: patientData.userId,
          tenantId: patientData.tenantId,
        },
        "Patient profile created successfully"
      );

      return createdPatient;
    } catch (error: any) {
      moduleLogger.error("Error creating patient profile:", error);
      throw error;
    }
  }

  async findById(id: string, tenantId: string): Promise<PatientEntity | null> {
    try {
      // Try cache first
      const cacheKey = CACHE_KEYS.PATIENT(id);
      const cached = await redis.get<any>(cacheKey, tenantId);
      if (cached) {
        return PatientEntity.fromDatabase(cached);
      }

      // Query database
      const patientData = await db.queryOne(
        "SELECT * FROM patients WHERE id = ? AND tenant_id = ?",
        [id, tenantId],
        tenantId
      );

      if (!patientData) {
        return null;
      }

      const patientEntity = PatientEntity.fromDatabase(patientData);

      // Cache for 15 minutes
      await redis.set(cacheKey, patientData, this.CACHE_TTL, tenantId);

      return patientEntity;
    } catch (error: any) {
      moduleLogger.error("Error finding patient by ID:", error);
      throw error;
    }
  }

  async findByUserId(userId: string, tenantId: string): Promise<PatientEntity | null> {
    return await this.findById(userId, tenantId); // Same thing since id = userId
  }

  async findWithUserDetails(id: string, tenantId: string): Promise<PatientWithUser | null> {
    try {
      const patientData = await db.queryOne(
        `SELECT 
          p.*,
          u.first_name,
          u.last_name,
          u.email,
          u.phone,
          u.date_of_birth,
          u.is_active as user_is_active,
          u.is_verified
        FROM patients p
        JOIN users u ON p.id = u.id
        WHERE p.id = ? AND p.tenant_id = ?`,
        [id, tenantId],
        tenantId
      );

      if (!patientData) {
        return null;
      }

      const patient = PatientEntity.fromDatabase(patientData).toJSON();

      return {
        ...patient,
        firstName: patientData.first_name,
        lastName: patientData.last_name,
        email: patientData.email,
        phone: patientData.phone,
        dateOfBirth: patientData.date_of_birth ? new Date(patientData.date_of_birth) : undefined,
        isActive: Boolean(patientData.user_is_active),
        isVerified: Boolean(patientData.is_verified),
      } as any;
    } catch (error: any) {
      moduleLogger.error("Error finding patient with user details:", error);
      throw error;
    }
  }

  async findAll(
    tenantId: string,
    options?: {
      isActive?: boolean;
      limit?: number;
      offset?: number;
      searchTerm?: string;
    }
  ): Promise<PatientWithUser[]> {
    try {
      let query = `
        SELECT 
          p.*,
          u.first_name,
          u.last_name,
          u.email,
          u.phone,
          u.date_of_birth,
          u.is_active as user_is_active,
          u.is_verified
        FROM patients p
        JOIN users u ON p.id = u.id
        WHERE p.tenant_id = ?
      `;

      const params: any[] = [tenantId];

      if (options?.isActive !== undefined) {
        query += " AND u.is_active = ?";
        params.push(options.isActive);
      }

      if (options?.searchTerm) {
        query += ` AND (
          u.first_name LIKE ? OR 
          u.last_name LIKE ? OR 
          u.email LIKE ? OR
          p.medical_record_number LIKE ?
        )`;
        const searchPattern = `%${options.searchTerm}%`;
        params.push(searchPattern, searchPattern, searchPattern, searchPattern);
      }

      query += " ORDER BY u.first_name, u.last_name";

      if (options?.limit) {
        query += " LIMIT ?";
        params.push(options.limit);

        if (options?.offset) {
          query += " OFFSET ?";
          params.push(options.offset);
        }
      }

      const patients = await db.query(query, params, tenantId);

      return patients.map((patientData) => {
        const patient = PatientEntity.fromDatabase(patientData).toJSON();
        return {
          ...patient,
          firstName: patientData.first_name,
          lastName: patientData.last_name,
          email: patientData.email,
          phone: patientData.phone,
          dateOfBirth: patientData.date_of_birth ? new Date(patientData.date_of_birth) : undefined,
          isActive: Boolean(patientData.user_is_active),
          isVerified: Boolean(patientData.is_verified),
        };
      }) as any;
    } catch (error: any) {
      moduleLogger.error("Error finding all patients:", error);
      throw error;
    }
  }

  async findByMedicalRecordNumber(medicalRecordNumber: string, tenantId: string): Promise<PatientEntity | null> {
    try {
      const patientData = await db.queryOne(
        "SELECT * FROM patients WHERE medical_record_number = ? AND tenant_id = ?",
        [medicalRecordNumber, tenantId],
        tenantId
      );

      if (!patientData) {
        return null;
      }

      return PatientEntity.fromDatabase(patientData);
    } catch (error: any) {
      moduleLogger.error("Error finding patient by medical record number:", error);
      throw error;
    }
  }

  async update(id: string, updateData: UpdatePatientData, tenantId: string): Promise<PatientEntity> {
    try {
      const patient = await this.findById(id, tenantId);
      if (!patient) {
        throw new NotFoundError("Patient not found");
      }

      // Check for duplicate medical record number if being updated
      if (updateData.medicalRecordNumber) {
        const existingPatient = await this.findByMedicalRecordNumber(updateData.medicalRecordNumber, tenantId);
        if (existingPatient && existingPatient.id !== id) {
          throw new ConflictError("Medical record number already exists");
        }
      }

      patient.updateMedicalInfo(updateData);
      const dbData = patient.toDatabaseFormat();

      await db.query(
        `UPDATE patients SET 
          medical_record_number = ?, emergency_contact_name = ?, 
          emergency_contact_phone = ?, blood_type = ?, 
          allergies = ?, medical_history = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND tenant_id = ?`,
        [
          dbData.medical_record_number,
          dbData.emergency_contact_name,
          dbData.emergency_contact_phone,
          dbData.blood_type,
          dbData.allergies,
          dbData.medical_history,
          id,
          tenantId,
        ],
        tenantId
      );

      // Invalidate cache
      await redis.del(CACHE_KEYS.PATIENT(id), tenantId);

      moduleLogger.info(
        {
          patientId: id,
          tenantId,
          updates: Object.keys(updateData),
        },
        "Patient profile updated successfully"
      );

      return patient;
    } catch (error: any) {
      moduleLogger.error("Error updating patient profile:", error);
      throw error;
    }
  }

  async delete(id: string, tenantId: string): Promise<void> {
    try {
      const patient = await this.findById(id, tenantId);
      if (!patient) {
        throw new NotFoundError("Patient not found");
      }

      await db.query("DELETE FROM patients WHERE id = ? AND tenant_id = ?", [id, tenantId], tenantId);

      // Invalidate cache
      await redis.del(CACHE_KEYS.PATIENT(id), tenantId);

      moduleLogger.info(
        {
          patientId: id,
          tenantId,
        },
        "Patient profile deleted successfully"
      );
    } catch (error: any) {
      moduleLogger.error("Error deleting patient profile:", error);
      throw error;
    }
  }

  async getStats(tenantId: string): Promise<any> {
    try {
      const stats = await db.queryOne(
        `SELECT 
          COUNT(*) as total_patients,
          COUNT(CASE WHEN u.is_active = true THEN 1 END) as active_patients,
          COUNT(CASE WHEN p.medical_record_number IS NOT NULL THEN 1 END) as patients_with_mrn,
          COUNT(CASE WHEN p.emergency_contact_name IS NOT NULL THEN 1 END) as patients_with_emergency_contact
        FROM patients p
        JOIN users u ON p.id = u.id
        WHERE p.tenant_id = ?`,
        [tenantId],
        tenantId
      );

      return {
        totalPatients: parseInt(stats.total_patients),
        activePatients: parseInt(stats.active_patients),
        patientsWithMRN: parseInt(stats.patients_with_mrn),
        patientsWithEmergencyContact: parseInt(stats.patients_with_emergency_contact),
      };
    } catch (error: any) {
      moduleLogger.error("Error getting patient stats:", error);
      throw error;
    }
  }

  async searchPatients(searchTerm: string, tenantId: string, limit: number = 20): Promise<PatientWithUser[]> {
    try {
      return await this.findAll(tenantId, {
        searchTerm,
        isActive: true,
        limit,
      });
    } catch (error: any) {
      moduleLogger.error("Error searching patients:", error);
      throw error;
    }
  }
}
