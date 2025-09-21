import { db } from "@/shared/config/database";
import { redis } from "@/shared/config/redis";
import { createModuleLogger } from "@/shared/config/logger";
import { CACHE_KEYS, NotFoundError, AppointmentStatus } from "@/shared/types/common.types";
import {
  AppointmentEntity,
  CreateAppointmentData,
  UpdateAppointmentData,
  AppointmentWithDetails,
} from "../models/appointment.model";

const moduleLogger = createModuleLogger("AppointmentRepository");

export interface DashboardStats {
  total: number;
  pending: number;
  confirmed: number;
  completed: number;
  todayAppointments: number;
  cancelled?: number;
  noShow?: number;
}

export class AppointmentRepository {
  private readonly CACHE_TTL = 300; // 5 minutes

  async create(appointmentData: CreateAppointmentData): Promise<AppointmentEntity> {
    try {
      const appointmentEntity = AppointmentEntity.create(appointmentData);
      const dbData = appointmentEntity.toDatabaseFormat();

      const result = await db.query<{ insertId: string }>(
        `INSERT INTO appointments (
          tenant_id, doctor_id, patient_id, appointment_date, start_time, end_time,
          status, reason_for_visit
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          dbData.tenant_id,
          dbData.doctor_id,
          dbData.patient_id,
          dbData.appointment_date,
          dbData.start_time,
          dbData.end_time,
          dbData.status,
          dbData.reason_for_visit,
        ],
        appointmentData.tenantId
      );

      // Fetch the created appointment
      const createdAppointment = await this.findById(result[0]!.insertId, appointmentData.tenantId);
      if (!createdAppointment) {
        throw new Error("Failed to create appointment");
      }

      // Invalidate related caches
      await this.invalidateRelatedCaches(
        createdAppointment.doctorId,
        createdAppointment.patientId,
        appointmentData.tenantId
      );

      moduleLogger.info(
        {
          appointmentId: createdAppointment.id,
          doctorId: appointmentData.doctorId,
          patientId: appointmentData.patientId,
          tenantId: appointmentData.tenantId,
        },
        "Appointment created successfully"
      );

      return createdAppointment;
    } catch (error: any) {
      moduleLogger.error("Error creating appointment:", error);
      throw error;
    }
  }

  async findById(id: string, tenantId: string): Promise<AppointmentEntity | null> {
    try {
      // Try cache first
      const cacheKey = CACHE_KEYS.APPOINTMENT(id);
      const cached = await redis.get<any>(cacheKey, tenantId);
      if (cached) {
        return AppointmentEntity.fromDatabase(cached);
      }

      // Query database
      const appointmentData = await db.queryOne(
        "SELECT * FROM appointments WHERE id = ? AND tenant_id = ?",
        [id, tenantId],
        tenantId
      );

      if (!appointmentData) {
        return null;
      }

      const appointmentEntity = AppointmentEntity.fromDatabase(appointmentData);

      // Cache for 5 minutes
      await redis.set(cacheKey, appointmentData, this.CACHE_TTL, tenantId);

      return appointmentEntity;
    } catch (error: any) {
      moduleLogger.error("Error finding appointment by ID:", error);
      throw error;
    }
  }

  async findWithDetails(id: string, tenantId: string): Promise<AppointmentWithDetails | null> {
    try {
      const appointmentData = await db.queryOne(
        `SELECT 
          a.*,
          CONCAT(du.first_name, ' ', du.last_name) as doctor_name,
          d.specialization as doctor_specialization,
          CONCAT(pu.first_name, ' ', pu.last_name) as patient_name,
          pu.email as patient_email,
          pu.phone as patient_phone
        FROM appointments a
        JOIN users du ON a.doctor_id = du.id
        JOIN doctors d ON a.doctor_id = d.id
        JOIN users pu ON a.patient_id = pu.id
        WHERE a.id = ? AND a.tenant_id = ?`,
        [id, tenantId],
        tenantId
      );

      if (!appointmentData) {
        return null;
      }

      return {
        ...AppointmentEntity.fromDatabase(appointmentData).toJSON(),
        doctorName: appointmentData.doctor_name,
        doctorSpecialization: appointmentData.doctor_specialization,
        patientName: appointmentData.patient_name,
        patientEmail: appointmentData.patient_email,
        patientPhone: appointmentData.patient_phone,
      };
    } catch (error: any) {
      moduleLogger.error("Error finding appointment with details:", error);
      throw error;
    }
  }

  async findByDoctor(
    doctorId: string,
    tenantId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      status?: AppointmentStatus[];
      limit?: number;
      offset?: number;
    }
  ): Promise<AppointmentEntity[]> {
    try {
      let query = "SELECT * FROM appointments WHERE doctor_id = ?";
      const params: any[] = [doctorId];

      if (options?.startDate) {
        query += " AND appointment_date >= ?";
        params.push(options.startDate);
      }

      if (options?.endDate) {
        query += " AND appointment_date <= ?";
        params.push(options.endDate);
      }

      if (options?.status && options.status.length > 0) {
        const placeholders = options.status.map(() => "?").join(",");
        query += ` AND status IN (${placeholders})`;
        params.push(...options.status);
      }

      query += " ORDER BY appointment_date ASC, start_time ASC";

      if (options?.limit != null) {
        const limit = Number(options.limit);
        if (!Number.isInteger(limit)) throw new Error("Invalid limit");

        query += ` LIMIT ${limit}`;

        if (options?.offset != null) {
          const offset = Number(options.offset);
          if (!Number.isInteger(offset)) throw new Error("Invalid offset");

          query += ` OFFSET ${offset}`;
        }
      }

      const appointments = await db.query(query, params, tenantId);
      return appointments.map((appointmentData) => AppointmentEntity.fromDatabase(appointmentData));
    } catch (error: any) {
      moduleLogger.error("Error finding appointments by doctor:", error);
      throw error;
    }
  }

  async findByPatient(
    patientId: string,
    tenantId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      status?: AppointmentStatus[];
      limit?: number;
      offset?: number;
    }
  ): Promise<AppointmentEntity[]> {
    try {
      let query = "SELECT * FROM appointments WHERE patient_id = ? AND tenant_id = ?";
      const params: any[] = [patientId, tenantId];

      if (options?.startDate) {
        query += " AND appointment_date >= ?";
        params.push(options.startDate);
      }

      if (options?.endDate) {
        query += " AND appointment_date <= ?";
        params.push(options.endDate);
      }

      if (options?.status && options.status.length > 0) {
        const placeholders = options.status.map(() => "?").join(",");
        query += ` AND status IN (${placeholders})`;
        params.push(...options.status);
      }

      query += " ORDER BY appointment_date ASC, start_time ASC";

      if (options?.limit) {
        query += " LIMIT ?";
        params.push(options.limit);

        if (options?.offset) {
          query += " OFFSET ?";
          params.push(options.offset);
        }
      }

      const appointments = await db.query(query, params, tenantId);
      return appointments.map((appointmentData) => AppointmentEntity.fromDatabase(appointmentData));
    } catch (error: any) {
      moduleLogger.error("Error finding appointments by patient:", error);
      throw error;
    }
  }

  async findConflicting(
    doctorId: string,
    patientId: string,
    appointmentDate: Date,
    startTime: string,
    endTime: string,
    tenantId: string,
    excludeAppointmentId?: string
  ): Promise<AppointmentEntity[]> {
    try {
      let query = `
        SELECT * FROM appointments 
        WHERE tenant_id = ? 
        AND appointment_date = ?
        AND (
          (doctor_id = ? OR patient_id = ?)
          AND (
            (start_time < ? AND end_time > ?) OR
            (start_time < ? AND end_time > ?) OR
            (start_time >= ? AND end_time <= ?)
          )
        )
        AND status IN ('scheduled', 'confirmed')
      `;

      const params = [
        tenantId,
        appointmentDate,
        doctorId,
        patientId,
        endTime,
        startTime, // Check if existing appointment overlaps with new start
        startTime,
        endTime, // Check if existing appointment overlaps with new end
        startTime,
        endTime, // Check if new appointment completely contains existing
      ];

      if (excludeAppointmentId) {
        query += " AND id != ?";
        params.push(excludeAppointmentId);
      }

      const conflictingAppointments = await db.query(query, params, tenantId);
      return conflictingAppointments.map((appointmentData) => AppointmentEntity.fromDatabase(appointmentData));
    } catch (error: any) {
      moduleLogger.error("Error finding conflicting appointments:", error);
      throw error;
    }
  }

  async update(id: string, updateData: UpdateAppointmentData, tenantId: string): Promise<AppointmentEntity> {
    try {
      const appointment = await this.findById(id, tenantId);
      if (!appointment) {
        throw new NotFoundError("Appointment not found");
      }

      appointment.update(updateData);
      const dbData = appointment.toDatabaseFormat();

      await db.query(
        `UPDATE appointments SET 
          appointment_date = ?, start_time = ?, end_time = ?, status = ?,
          reason_for_visit = ?, notes = ?, cancellation_reason = ?,
          cancelled_by = ?, cancelled_at = ?, confirmed_at = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND tenant_id = ?`,
        [
          dbData.appointment_date,
          dbData.start_time,
          dbData.end_time,
          dbData.status,
          dbData.reason_for_visit,
          dbData.notes,
          dbData.cancellation_reason,
          dbData.cancelled_by,
          dbData.cancelled_at,
          dbData.confirmed_at,
          id,
          tenantId,
        ],
        tenantId
      );

      // Invalidate caches
      await redis.del(CACHE_KEYS.APPOINTMENT(id), tenantId);
      await this.invalidateRelatedCaches(appointment.doctorId, appointment.patientId, tenantId);

      moduleLogger.info(
        {
          appointmentId: id,
          tenantId,
          updates: Object.keys(updateData),
        },
        "Appointment updated successfully"
      );

      return appointment;
    } catch (error: any) {
      moduleLogger.error("Error updating appointment:", error);
      throw error;
    }
  }

  async delete(id: string, tenantId: string): Promise<void> {
    try {
      const appointment = await this.findById(id, tenantId);
      if (!appointment) {
        throw new NotFoundError("Appointment not found");
      }

      await db.query("DELETE FROM appointments WHERE id = ? AND tenant_id = ?", [id, tenantId], tenantId);

      // Invalidate caches
      await redis.del(CACHE_KEYS.APPOINTMENT(id), tenantId);
      await this.invalidateRelatedCaches(appointment.doctorId, appointment.patientId, tenantId);

      moduleLogger.info(
        {
          appointmentId: id,
          tenantId,
        },
        "Appointment deleted successfully"
      );
    } catch (error: any) {
      moduleLogger.error("Error deleting appointment:", error);
      throw error;
    }
  }

  async getUpcomingAppointments(tenantId: string, limit: number = 50): Promise<AppointmentWithDetails[]> {
    try {
      const appointments = await db.query(
        `SELECT 
          a.*,
          CONCAT(du.first_name, ' ', du.last_name) as doctor_name,
          d.specialization as doctor_specialization,
          CONCAT(pu.first_name, ' ', pu.last_name) as patient_name,
          pu.email as patient_email,
          pu.phone as patient_phone
        FROM appointments a
        JOIN users du ON a.doctor_id = du.id
        JOIN doctors d ON a.doctor_id = d.id
        JOIN users pu ON a.patient_id = pu.id
        WHERE a.tenant_id = ? 
        AND a.appointment_date >= CURDATE()
        AND a.status IN ('scheduled', 'confirmed')
        ORDER BY a.appointment_date ASC, a.start_time ASC
        LIMIT ?`,
        [tenantId, limit],
        tenantId
      );

      return appointments.map((appointmentData) => ({
        ...AppointmentEntity.fromDatabase(appointmentData).toJSON(),
        doctorName: appointmentData.doctor_name,
        doctorSpecialization: appointmentData.doctor_specialization,
        patientName: appointmentData.patient_name,
        patientEmail: appointmentData.patient_email,
        patientPhone: appointmentData.patient_phone,
      }));
    } catch (error: any) {
      moduleLogger.error("Error getting upcoming appointments:", error);
      throw error;
    }
  }

  async getDashboardStats(tenantId: string, userId?: string, userRole?: string): Promise<DashboardStats> {
    try {
      const cacheKey = `dashboard_stats:${tenantId}:${userId || "all"}:${userRole || "all"}`;
      const cached = await redis.get<DashboardStats>(cacheKey, tenantId);

      if (cached) {
        return cached;
      }

      let whereClause = "WHERE tenant_id = ?";
      const params: any[] = [tenantId];

      // Apply role-based filtering
      if (userRole === "doctor" && userId) {
        whereClause += " AND doctor_id = ?";
        params.push(userId);
      } else if (userRole === "patient" && userId) {
        whereClause += " AND patient_id = ?";
        params.push(userId);
      }

      const statsQueries = await Promise.all([
        // Total appointments
        db.queryOne(`SELECT COUNT(*) as count FROM appointments ${whereClause}`, params, tenantId),

        // Pending appointments (scheduled)
        db.queryOne(
          `SELECT COUNT(*) as count FROM appointments ${whereClause} AND status = 'scheduled'`,
          params,
          tenantId
        ),

        // Confirmed appointments
        db.queryOne(
          `SELECT COUNT(*) as count FROM appointments ${whereClause} AND status = 'confirmed'`,
          params,
          tenantId
        ),

        // Completed appointments
        db.queryOne(
          `SELECT COUNT(*) as count FROM appointments ${whereClause} AND status = 'completed'`,
          params,
          tenantId
        ),

        // Today's appointments
        db.queryOne(
          `SELECT COUNT(*) as count FROM appointments ${whereClause} AND DATE(appointment_date) = CURDATE()`,
          params,
          tenantId
        ),

        // Cancelled appointments
        db.queryOne(
          `SELECT COUNT(*) as count FROM appointments ${whereClause} AND status = 'cancelled'`,
          params,
          tenantId
        ),

        // No-show appointments
        db.queryOne(
          `SELECT COUNT(*) as count FROM appointments ${whereClause} AND status = 'no_show'`,
          params,
          tenantId
        ),
      ]);

      const stats: DashboardStats = {
        total: parseInt(statsQueries[0]?.count || "0"),
        pending: parseInt(statsQueries[1]?.count || "0"),
        confirmed: parseInt(statsQueries[2]?.count || "0"),
        completed: parseInt(statsQueries[3]?.count || "0"),
        todayAppointments: parseInt(statsQueries[4]?.count || "0"),
        cancelled: parseInt(statsQueries[5]?.count || "0"),
        noShow: parseInt(statsQueries[6]?.count || "0"),
      };

      // Cache for 5 minutes
      await redis.set(cacheKey, stats, this.CACHE_TTL, tenantId);

      moduleLogger.info(
        {
          tenantId,
          userId,
          userRole,
          stats,
        },
        "Dashboard stats retrieved successfully"
      );

      return stats;
    } catch (error: any) {
      moduleLogger.error("Error getting dashboard stats:", error);
      throw error;
    }
  }

  private async invalidateRelatedCaches(doctorId: string, patientId: string, tenantId: string): Promise<void> {
    // Invalidate doctor and patient availability caches
    const today = new Date().toISOString().split("T")[0];
    await redis.del(CACHE_KEYS.AVAILABILITY(doctorId, today!), tenantId);

    // Could also invalidate patient's appointment cache, schedule cache, etc.
    // This is where you'd add more sophisticated cache invalidation logic
  }
}
