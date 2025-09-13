import { db } from "@/shared/config/database";
import { redis } from "@/shared/config/redis";
import { createModuleLogger } from "@/shared/config/logger";
import { CACHE_KEYS, NotFoundError, DayOfWeek } from "@/shared/types/common.types";
import {
  DoctorAvailabilityEntity,
  AvailabilityOverrideEntity,
  CreateAvailabilityData,
  CreateAvailabilityOverrideData,
} from "../models/doctor.model";

const moduleLogger = createModuleLogger("AvailabilityRepository");

export class AvailabilityRepository {
  private readonly CACHE_TTL = 1800; // 30 minutes

  // Regular availability methods
  async createAvailability(availabilityData: CreateAvailabilityData): Promise<DoctorAvailabilityEntity> {
    try {
      const availabilityEntity = DoctorAvailabilityEntity.create(availabilityData);
      const dbData = availabilityEntity.toDatabaseFormat();

      const result = await db.query<{ insertId: string }>(
        `INSERT INTO doctor_availability (
          tenant_id, doctor_id, day_of_week, start_time, end_time, is_active
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [dbData.tenant_id, dbData.doctor_id, dbData.day_of_week, dbData.start_time, dbData.end_time, dbData.is_active],
        availabilityData.tenantId
      );

      const created = await this.findAvailabilityById(result[0]!.insertId, availabilityData.tenantId);
      if (!created) {
        throw new Error("Failed to create availability");
      }

      // Invalidate cache
      await this.invalidateAvailabilityCache(availabilityData.doctorId, availabilityData.tenantId);

      moduleLogger.info(
        {
          doctorId: availabilityData.doctorId,
          dayOfWeek: availabilityData.dayOfWeek,
          timeSlot: `${availabilityData.startTime}-${availabilityData.endTime}`,
        },
        "Doctor availability created"
      );

      return created;
    } catch (error: any) {
      moduleLogger.error("Error creating doctor availability:", error);
      throw error;
    }
  }

  async findAvailabilityById(id: string, tenantId: string): Promise<DoctorAvailabilityEntity | null> {
    try {
      const availabilityData = await db.queryOne(
        "SELECT * FROM doctor_availability WHERE id = ? AND tenant_id = ?",
        [id, tenantId],
        tenantId
      );

      if (!availabilityData) {
        return null;
      }

      return DoctorAvailabilityEntity.fromDatabase(availabilityData);
    } catch (error: any) {
      moduleLogger.error("Error finding availability by ID:", error);
      throw error;
    }
  }

  async findDoctorAvailability(doctorId: string, tenantId: string): Promise<DoctorAvailabilityEntity[]> {
    try {
      // Try cache first
      const cacheKey = CACHE_KEYS.DOCTOR_SCHEDULE(doctorId);
      const cached = await redis.get<any[]>(cacheKey, tenantId);
      if (cached) {
        return cached.map((data) => DoctorAvailabilityEntity.fromDatabase(data));
      }

      const availabilities = await db.query(
        `SELECT * FROM doctor_availability 
         WHERE doctor_id = ? AND tenant_id = ? AND is_active = true
         ORDER BY day_of_week, start_time`,
        [doctorId, tenantId],
        tenantId
      );

      const entities = availabilities.map((data) => DoctorAvailabilityEntity.fromDatabase(data));

      // Cache for 30 minutes
      await redis.set(cacheKey, availabilities, this.CACHE_TTL, tenantId);

      return entities;
    } catch (error: any) {
      moduleLogger.error("Error finding doctor availability:", error);
      throw error;
    }
  }

  async findAvailabilityByDay(
    doctorId: string,
    dayOfWeek: DayOfWeek,
    tenantId: string
  ): Promise<DoctorAvailabilityEntity[]> {
    try {
      const availabilities = await db.query(
        `SELECT * FROM doctor_availability 
         WHERE doctor_id = ? AND day_of_week = ? AND tenant_id = ? AND is_active = true
         ORDER BY start_time`,
        [doctorId, dayOfWeek, tenantId],
        tenantId
      );

      return availabilities.map((data) => DoctorAvailabilityEntity.fromDatabase(data));
    } catch (error: any) {
      moduleLogger.error("Error finding availability by day:", error);
      throw error;
    }
  }

  async updateAvailability(
    id: string,
    startTime: string,
    endTime: string,
    tenantId: string
  ): Promise<DoctorAvailabilityEntity> {
    try {
      const availability = await this.findAvailabilityById(id, tenantId);
      if (!availability) {
        throw new NotFoundError("Availability not found");
      }

      availability.updateTimes(startTime, endTime);

      await db.query(
        `UPDATE doctor_availability 
         SET start_time = ?, end_time = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND tenant_id = ?`,
        [startTime, endTime, id, tenantId],
        tenantId
      );

      // Invalidate cache
      await this.invalidateAvailabilityCache(availability.doctorId, tenantId);

      moduleLogger.info(
        {
          availabilityId: id,
          doctorId: availability.doctorId,
          newTimeSlot: `${startTime}-${endTime}`,
        },
        "Doctor availability updated"
      );

      return availability;
    } catch (error: any) {
      moduleLogger.error("Error updating availability:", error);
      throw error;
    }
  }

  async deleteAvailability(id: string, tenantId: string): Promise<void> {
    try {
      const availability = await this.findAvailabilityById(id, tenantId);
      if (!availability) {
        throw new NotFoundError("Availability not found");
      }

      await db.query("DELETE FROM doctor_availability WHERE id = ? AND tenant_id = ?", [id, tenantId], tenantId);

      // Invalidate cache
      await this.invalidateAvailabilityCache(availability.doctorId, tenantId);

      moduleLogger.info(
        {
          availabilityId: id,
          doctorId: availability.doctorId,
        },
        "Doctor availability deleted"
      );
    } catch (error: any) {
      moduleLogger.error("Error deleting availability:", error);
      throw error;
    }
  }

  async setWeeklySchedule(
    doctorId: string,
    schedule: { dayOfWeek: DayOfWeek; startTime: string; endTime: string }[],
    tenantId: string
  ): Promise<void> {
    try {
      await db.transaction(async (connection) => {
        // First, delete existing schedule
        await db.executeTransaction(
          "DELETE FROM doctor_availability WHERE doctor_id = ? AND tenant_id = ?",
          [doctorId, tenantId],
          connection,
          tenantId
        );

        // Then, insert new schedule
        for (const slot of schedule) {
          await db.executeTransaction(
            `INSERT INTO doctor_availability (
              tenant_id, doctor_id, day_of_week, start_time, end_time, is_active
            ) VALUES (?, ?, ?, ?, ?, true)`,
            [tenantId, doctorId, slot.dayOfWeek, slot.startTime, slot.endTime],
            connection,
            tenantId
          );
        }
      });

      // Invalidate cache
      await this.invalidateAvailabilityCache(doctorId, tenantId);

      moduleLogger.info(
        {
          doctorId,
          scheduleCount: schedule.length,
        },
        "Doctor weekly schedule updated"
      );
    } catch (error: any) {
      moduleLogger.error("Error setting weekly schedule:", error);
      throw error;
    }
  }

  // Availability override methods
  async createOverride(overrideData: CreateAvailabilityOverrideData): Promise<AvailabilityOverrideEntity> {
    try {
      const overrideEntity = AvailabilityOverrideEntity.create(overrideData);
      const dbData = overrideEntity.toDatabaseFormat();

      const result = await db.query<{ insertId: string }>(
        `INSERT INTO availability_overrides (
          tenant_id, doctor_id, date, start_time, end_time, is_available, reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          start_time = VALUES(start_time),
          end_time = VALUES(end_time),
          is_available = VALUES(is_available),
          reason = VALUES(reason),
          updated_at = CURRENT_TIMESTAMP`,
        [
          dbData.tenant_id,
          dbData.doctor_id,
          dbData.date,
          dbData.start_time,
          dbData.end_time,
          dbData.is_available,
          dbData.reason,
        ],
        overrideData.tenantId
      );

      // Invalidate cache for the specific date
      const dateStr = overrideData.date.toISOString().split("T")[0];
      await redis.del(CACHE_KEYS.AVAILABILITY(overrideData.doctorId, dateStr!), overrideData.tenantId);

      const created = await this.findOverrideById(result[0]!.insertId, overrideData.tenantId);
      if (!created) {
        // It might be an update, so find by doctor and date
        const existing = await this.findOverrideByDoctorAndDate(
          overrideData.doctorId,
          overrideData.date,
          overrideData.tenantId
        );
        if (!existing) {
          throw new Error("Failed to create availability override");
        }
        return existing;
      }

      moduleLogger.info(
        {
          doctorId: overrideData.doctorId,
          date: dateStr,
          isAvailable: overrideData.isAvailable,
        },
        "Availability override created"
      );

      return created;
    } catch (error: any) {
      moduleLogger.error("Error creating availability override:", error);
      throw error;
    }
  }

  async findOverrideById(id: string, tenantId: string): Promise<AvailabilityOverrideEntity | null> {
    try {
      const overrideData = await db.queryOne(
        "SELECT * FROM availability_overrides WHERE id = ? AND tenant_id = ?",
        [id, tenantId],
        tenantId
      );

      if (!overrideData) {
        return null;
      }

      return AvailabilityOverrideEntity.fromDatabase(overrideData);
    } catch (error: any) {
      moduleLogger.error("Error finding override by ID:", error);
      throw error;
    }
  }

  async findOverrideByDoctorAndDate(
    doctorId: string,
    date: Date,
    tenantId: string
  ): Promise<AvailabilityOverrideEntity | null> {
    try {
      const dateStr = date.toISOString().split("T")[0];

      const overrideData = await db.queryOne(
        "SELECT * FROM availability_overrides WHERE doctor_id = ? AND date = ? AND tenant_id = ?",
        [doctorId, dateStr, tenantId],
        tenantId
      );

      if (!overrideData) {
        return null;
      }

      return AvailabilityOverrideEntity.fromDatabase(overrideData);
    } catch (error: any) {
      moduleLogger.error("Error finding override by doctor and date:", error);
      throw error;
    }
  }

  async findOverridesByDateRange(
    doctorId: string,
    startDate: Date,
    endDate: Date,
    tenantId: string
  ): Promise<AvailabilityOverrideEntity[]> {
    try {
      const startDateStr = startDate.toISOString().split("T")[0];
      const endDateStr = endDate.toISOString().split("T")[0];

      const overrides = await db.query(
        `SELECT * FROM availability_overrides 
         WHERE doctor_id = ? AND date >= ? AND date <= ? AND tenant_id = ?
         ORDER BY date`,
        [doctorId, startDateStr, endDateStr, tenantId],
        tenantId
      );

      return overrides.map((data) => AvailabilityOverrideEntity.fromDatabase(data));
    } catch (error: any) {
      moduleLogger.error("Error finding overrides by date range:", error);
      throw error;
    }
  }

  async deleteOverride(id: string, tenantId: string): Promise<void> {
    try {
      const override = await this.findOverrideById(id, tenantId);
      if (!override) {
        throw new NotFoundError("Availability override not found");
      }

      await db.query("DELETE FROM availability_overrides WHERE id = ? AND tenant_id = ?", [id, tenantId], tenantId);

      // Invalidate cache for the specific date
      const dateStr = override.date.toISOString().split("T")[0];
      await redis.del(CACHE_KEYS.AVAILABILITY(override.doctorId, dateStr!), tenantId);

      moduleLogger.info(
        {
          overrideId: id,
          doctorId: override.doctorId,
          date: dateStr,
        },
        "Availability override deleted"
      );
    } catch (error: any) {
      moduleLogger.error("Error deleting availability override:", error);
      throw error;
    }
  }

  private async invalidateAvailabilityCache(doctorId: string, tenantId: string): Promise<void> {
    // Invalidate weekly schedule cache
    await redis.del(CACHE_KEYS.DOCTOR_SCHEDULE(doctorId), tenantId);

    // Invalidate daily availability cache for current week
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const dateStr = date.toISOString().split("T")[0];
      await redis.del(CACHE_KEYS.AVAILABILITY(doctorId, dateStr!), tenantId);
    }
  }
}
