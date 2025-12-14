import { db } from "@/shared/config/database";
import { redis } from "@/shared/config/redis";
import { createModuleLogger } from "@/shared/config/logger";
import { CACHE_KEYS, NotFoundError, ConflictError } from "@/shared/types/common.types";
import { DoctorEntity, DoctorWithUser, CreateDoctorData, UpdateDoctorData } from "../models/doctor.model";

const moduleLogger = createModuleLogger("DoctorRepository");

export class DoctorRepository {
  private readonly CACHE_TTL = 900; // 15 minutes

  async create(doctorData: CreateDoctorData): Promise<DoctorEntity> {
    try {
      // Check if doctor profile already exists for this user
      const existingDoctor = await this.findByUserId(doctorData.userId, doctorData.tenantId);
      if (existingDoctor) {
        throw new ConflictError("Doctor profile already exists for this user");
      }

      const doctorEntity = DoctorEntity.create(doctorData);
      const dbData = doctorEntity.toDatabaseFormat();

      await db.query<{ insertId: string }>(
        `INSERT INTO doctors (
          id, tenant_id, specialization, license_number, bio, 
          consultation_fee, consultation_duration, is_accepting_appointments
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          doctorData.userId, // Use userId as the primary key (references users table)
          dbData.tenant_id,
          dbData.specialization,
          dbData.license_number,
          dbData.bio,
          dbData.consultation_fee,
          dbData.consultation_duration,
          dbData.is_accepting_appointments,
        ],
        doctorData.tenantId
      );

      // Fetch the created doctor
      const createdDoctor = await this.findById(doctorData.userId, doctorData.tenantId);
      if (!createdDoctor) {
        throw new Error("Failed to create doctor profile");
      }

      moduleLogger.info(
        {
          doctorId: doctorData.userId,
          tenantId: doctorData.tenantId,
          specialization: doctorData.specialization,
        },
        "Doctor profile created successfully"
      );

      return createdDoctor;
    } catch (error: any) {
      moduleLogger.error("Error creating doctor profile:", error);
      throw error;
    }
  }

  async findById(id: string, tenantId: string): Promise<DoctorEntity | null> {
    try {
      // Try cache first
      const cacheKey = CACHE_KEYS.DOCTOR(id);
      const cached = await redis.get<any>(cacheKey, tenantId);
      if (cached) {
        return DoctorEntity.fromDatabase(cached);
      }

      // Query database
      const doctorData = await db.queryOne(
        "SELECT * FROM doctors WHERE id = ? AND tenant_id = ?",
        [id, tenantId],
        tenantId
      );

      if (!doctorData) {
        return null;
      }

      const doctorEntity = DoctorEntity.fromDatabase(doctorData);

      // Cache for 15 minutes
      await redis.set(cacheKey, doctorData, this.CACHE_TTL, tenantId);

      return doctorEntity;
    } catch (error: any) {
      moduleLogger.error("Error finding doctor by ID:", error);
      throw error;
    }
  }

  async findByUserId(userId: string, tenantId: string): Promise<DoctorEntity | null> {
    return await this.findById(userId, tenantId); // Same thing since id = userId
  }

  async findWithUserDetails(id: string, tenantId: string): Promise<DoctorWithUser | null> {
    try {
      const doctorData = await db.queryOne(
        `SELECT 
          d.*,
          u.first_name,
          u.last_name,
          u.email,
          u.phone,
          u.is_active as user_is_active,
          u.is_verified
        FROM doctors d
        JOIN users u ON d.id = u.id
        WHERE d.id = ? AND d.tenant_id = ?`,
        [id, tenantId],
        tenantId
      );

      if (!doctorData) {
        return null;
      }

      const doctor = DoctorEntity.fromDatabase(doctorData).toJSON();

      return {
        ...doctor,
        firstName: doctorData.first_name,
        lastName: doctorData.last_name,
        email: doctorData.email,
        phone: doctorData.phone,
        isActive: Boolean(doctorData.user_is_active),
        isVerified: Boolean(doctorData.is_verified),
      };
    } catch (error: any) {
      moduleLogger.error("Error finding doctor with user details:", error);
      throw error;
    }
  }

  async findAll(
    tenantId: string,
    options?: {
      specialization?: string;
      isAcceptingAppointments?: boolean;
      isActive?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<DoctorWithUser[]> {
    try {
      let query = `
        SELECT 
          d.*,
          u.first_name,
          u.last_name,
          u.email,
          u.phone,
          u.is_active as user_is_active,
          u.is_verified
        FROM doctors d
        JOIN users u ON d.id = u.id
        WHERE d.tenant_id = ?
      `;

      const params: any[] = [tenantId];

      if (options?.specialization) {
        query += " AND d.specialization = ?";
        params.push(options.specialization);
      }

      if (options?.isAcceptingAppointments !== undefined) {
        query += " AND d.is_accepting_appointments = ?";
        params.push(options.isAcceptingAppointments);
      }

      if (options?.isActive !== undefined) {
        query += " AND u.is_active = ?";
        params.push(options.isActive);
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

      console.log(query);

      const doctors = await db.query(query, params, tenantId);

      return doctors.map((doctorData) => {
        const doctor = DoctorEntity.fromDatabase(doctorData).toJSON();
        return {
          ...doctor,
          firstName: doctorData.first_name,
          lastName: doctorData.last_name,
          email: doctorData.email,
          phone: doctorData.phone,
          isActive: Boolean(doctorData.user_is_active),
          isVerified: Boolean(doctorData.is_verified),
        };
      });
    } catch (error: any) {
      moduleLogger.error("Error finding all doctors:", error);
      throw error;
    }
  }

  async findBySpecialization(specialization: string, tenantId: string, limit: number = 50): Promise<DoctorWithUser[]> {
    try {
      return await this.findAll(tenantId, {
        specialization,
        isAcceptingAppointments: true,
        isActive: true,
        limit,
      });
    } catch (error: any) {
      moduleLogger.error("Error finding doctors by specialization:", error);
      throw error;
    }
  }

  async getSpecializations(tenantId: string): Promise<string[]> {
    try {
      const cacheKey = `specializations:${tenantId}`;
      const cached = await redis.get<string[]>(cacheKey, tenantId);
      if (cached) {
        return cached;
      }

      const specializations = await db.query(
        `SELECT DISTINCT specialization 
         FROM doctors d
         JOIN users u ON d.id = u.id
         WHERE d.tenant_id = ? AND u.is_active = true
         ORDER BY specialization`,
        [tenantId],
        tenantId
      );

      const result = specializations.map((row) => row.specialization);

      // Cache for 1 hour
      await redis.set(cacheKey, result, 3600, tenantId);

      return result;
    } catch (error: any) {
      moduleLogger.error("Error getting specializations:", error);
      throw error;
    }
  }

  async update(id: string, updateData: UpdateDoctorData, tenantId: string): Promise<DoctorEntity> {
    try {
      const doctor = await this.findById(id, tenantId);
      if (!doctor) {
        throw new NotFoundError("Doctor not found");
      }

      doctor.updateProfile(updateData);
      const dbData = doctor.toDatabaseFormat();

      await db.query(
        `UPDATE doctors SET 
          specialization = ?, license_number = ?, bio = ?, 
          consultation_fee = ?, consultation_duration = ?, 
          is_accepting_appointments = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND tenant_id = ?`,
        [
          dbData.specialization,
          dbData.license_number,
          dbData.bio,
          dbData.consultation_fee,
          dbData.consultation_duration,
          dbData.is_accepting_appointments,
          id,
          tenantId,
        ],
        tenantId
      );

      // Invalidate cache
      await redis.del(CACHE_KEYS.DOCTOR(id), tenantId);
      await this.invalidateSpecializationsCache(tenantId);

      moduleLogger.info(
        {
          doctorId: id,
          tenantId,
          updates: Object.keys(updateData),
        },
        "Doctor profile updated successfully"
      );

      return doctor;
    } catch (error: any) {
      moduleLogger.error("Error updating doctor profile:", error);
      throw error;
    }
  }

  async toggleAcceptingAppointments(id: string, tenantId: string): Promise<DoctorEntity> {
    try {
      const doctor = await this.findById(id, tenantId);
      if (!doctor) {
        throw new NotFoundError("Doctor not found");
      }

      doctor.toggleAcceptingAppointments();

      await db.query(
        "UPDATE doctors SET is_accepting_appointments = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?",
        [doctor.isAcceptingAppointments, id, tenantId],
        tenantId
      );

      // Invalidate cache
      await redis.del(CACHE_KEYS.DOCTOR(id), tenantId);

      moduleLogger.info(
        {
          doctorId: id,
          tenantId,
          isAcceptingAppointments: doctor.isAcceptingAppointments,
        },
        "Doctor appointment acceptance status updated"
      );

      return doctor;
    } catch (error: any) {
      moduleLogger.error("Error toggling appointment acceptance:", error);
      throw error;
    }
  }

  async delete(id: string, tenantId: string): Promise<void> {
    try {
      const doctor = await this.findById(id, tenantId);
      if (!doctor) {
        throw new NotFoundError("Doctor not found");
      }

      await db.query("DELETE FROM doctors WHERE id = ? AND tenant_id = ?", [id, tenantId], tenantId);

      // Invalidate cache
      await redis.del(CACHE_KEYS.DOCTOR(id), tenantId);
      await this.invalidateSpecializationsCache(tenantId);

      moduleLogger.info(
        {
          doctorId: id,
          tenantId,
        },
        "Doctor profile deleted successfully"
      );
    } catch (error: any) {
      moduleLogger.error("Error deleting doctor profile:", error);
      throw error;
    }
  }

  async getStats(tenantId: string): Promise<any> {
    try {
      const stats = await db.queryOne(
        `SELECT 
          COUNT(*) as total_doctors,
          COUNT(CASE WHEN d.is_accepting_appointments = true THEN 1 END) as accepting_appointments,
          COUNT(CASE WHEN u.is_active = true THEN 1 END) as active_doctors,
          COUNT(DISTINCT d.specialization) as total_specializations
        FROM doctors d
        JOIN users u ON d.id = u.id
        WHERE d.tenant_id = ?`,
        [tenantId],
        tenantId
      );

      return {
        totalDoctors: parseInt(stats.total_doctors),
        acceptingAppointments: parseInt(stats.accepting_appointments),
        activeDoctors: parseInt(stats.active_doctors),
        totalSpecializations: parseInt(stats.total_specializations),
      };
    } catch (error: any) {
      moduleLogger.error("Error getting doctor stats:", error);
      throw error;
    }
  }

  private async invalidateSpecializationsCache(tenantId: string): Promise<void> {
    await redis.del(`specializations:${tenantId}`, tenantId);
  }
}
