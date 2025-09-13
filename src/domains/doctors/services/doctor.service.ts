import { createModuleLogger } from "@/shared/config/logger";
import { NotFoundError, ValidationError, DayOfWeek } from "@/shared/types/common.types";
import { eventBus, EventTypes } from "@/shared/events/event-bus";
import { DoctorRepository } from "../repositories/doctor.repository";
import { AvailabilityRepository } from "../repositories/availability.repository";
import {
  DoctorEntity,
  DoctorWithUser,
  CreateDoctorData,
  UpdateDoctorData,
  CreateAvailabilityOverrideData,
  DoctorAvailabilityEntity,
  AvailabilityOverrideEntity,
} from "../models/doctor.model";
import { isValidTimeString } from "@/shared/utils/date";

const moduleLogger = createModuleLogger("DoctorService");

export interface CreateDoctorProfileRequest {
  userId: string;
  specialization: string;
  licenseNumber?: string;
  bio?: string;
  consultationFee?: number;
  consultationDuration?: number;
}

export interface UpdateDoctorProfileRequest {
  specialization?: string;
  licenseNumber?: string;
  bio?: string;
  consultationFee?: number;
  consultationDuration?: number;
  isAcceptingAppointments?: boolean;
}

export interface WeeklyScheduleSlot {
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
}

export interface AvailabilityOverrideRequest {
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:mm or null for all day
  endTime?: string; // HH:mm or null for all day
  isAvailable: boolean;
  reason?: string;
}

export class DoctorService {
  constructor(private doctorRepository: DoctorRepository, private availabilityRepository: AvailabilityRepository) {}

  async createDoctorProfile(
    request: CreateDoctorProfileRequest,
    tenantId: string,
    createdBy: string
  ): Promise<DoctorWithUser> {
    try {
      // Validate input
      this.validateCreateDoctorRequest(request);

      // Create doctor data
      const doctorData: CreateDoctorData = {
        tenantId,
        userId: request.userId,
        specialization: request.specialization.trim(),
        licenseNumber: request.licenseNumber?.trim(),
        bio: request.bio?.trim(),
        consultationFee: request.consultationFee,
        consultationDuration: request.consultationDuration || 30,
      };

      // Create doctor profile
      const doctor = await this.doctorRepository.create(doctorData);

      // Get doctor with user details
      const doctorWithDetails = await this.doctorRepository.findWithUserDetails(doctor.id, tenantId);
      if (!doctorWithDetails) {
        throw new Error("Failed to retrieve created doctor profile");
      }

      // Publish domain event
      const doctorCreatedEvent = eventBus.createEvent(
        EventTypes.DOCTOR_PROFILE_UPDATED,
        tenantId,
        doctor.id,
        "doctor",
        {
          doctorId: doctor.id,
          userId: request.userId,
          specialization: request.specialization,
          action: "created",
        },
        1,
        createdBy
      );

      await eventBus.publish(doctorCreatedEvent);

      moduleLogger.info(
        {
          doctorId: doctor.id,
          userId: request.userId,
          specialization: request.specialization,
          tenantId,
          createdBy,
        },
        "Doctor profile created successfully"
      );

      return doctorWithDetails;
    } catch (error: any) {
      moduleLogger.error("Error creating doctor profile:", error);
      throw error;
    }
  }

  async updateDoctorProfile(
    doctorId: string,
    request: UpdateDoctorProfileRequest,
    tenantId: string,
    updatedBy: string
  ): Promise<DoctorWithUser> {
    try {
      // Validate input
      this.validateUpdateDoctorRequest(request);

      // Check if doctor exists
      const existingDoctor = await this.doctorRepository.findById(doctorId, tenantId);
      if (!existingDoctor) {
        throw new NotFoundError("Doctor not found");
      }

      // Prepare update data
      const updateData: UpdateDoctorData = {};

      if (request.specialization !== undefined) {
        updateData.specialization = request.specialization.trim();
      }
      if (request.licenseNumber !== undefined) {
        updateData.licenseNumber = request.licenseNumber?.trim();
      }
      if (request.bio !== undefined) {
        updateData.bio = request.bio?.trim();
      }
      if (request.consultationFee !== undefined) {
        updateData.consultationFee = request.consultationFee;
      }
      if (request.consultationDuration !== undefined) {
        updateData.consultationDuration = request.consultationDuration;
      }
      if (request.isAcceptingAppointments !== undefined) {
        updateData.isAcceptingAppointments = request.isAcceptingAppointments;
      }

      // Update doctor profile
      const updatedDoctor = await this.doctorRepository.update(doctorId, updateData, tenantId);

      // Get updated doctor with details
      const doctorWithDetails = await this.doctorRepository.findWithUserDetails(doctorId, tenantId);
      if (!doctorWithDetails) {
        throw new Error("Failed to retrieve updated doctor profile");
      }

      // Publish domain event
      const doctorUpdatedEvent = eventBus.createEvent(
        EventTypes.DOCTOR_PROFILE_UPDATED,
        tenantId,
        doctorId,
        "doctor",
        {
          doctorId,
          changes: updateData,
          action: "updated",
        },
        1,
        updatedBy
      );

      await eventBus.publish(doctorUpdatedEvent);

      moduleLogger.info(
        {
          doctorId,
          tenantId,
          updatedBy,
          changes: Object.keys(updateData),
        },
        "Doctor profile updated successfully"
      );

      return doctorWithDetails;
    } catch (error: any) {
      moduleLogger.error("Error updating doctor profile:", error);
      throw error;
    }
  }

  async getDoctorProfile(doctorId: string, tenantId: string): Promise<DoctorWithUser | null> {
    try {
      return await this.doctorRepository.findWithUserDetails(doctorId, tenantId);
    } catch (error: any) {
      moduleLogger.error("Error getting doctor profile:", error);
      throw error;
    }
  }

  async getDoctors(
    tenantId: string,
    filters?: {
      specialization?: string;
      isAcceptingAppointments?: boolean;
      isActive?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ doctors: DoctorWithUser[]; total: number }> {
    try {
      const doctors = await this.doctorRepository.findAll(tenantId, filters);

      return {
        doctors,
        total: doctors.length, // This should be a separate count query in production
      };
    } catch (error: any) {
      moduleLogger.error("Error getting doctors:", error);
      throw error;
    }
  }

  async getDoctorsBySpecialization(
    specialization: string,
    tenantId: string,
    limit?: number
  ): Promise<DoctorWithUser[]> {
    try {
      return await this.doctorRepository.findBySpecialization(specialization, tenantId, limit);
    } catch (error: any) {
      moduleLogger.error("Error getting doctors by specialization:", error);
      throw error;
    }
  }

  async getSpecializations(tenantId: string): Promise<string[]> {
    try {
      return await this.doctorRepository.getSpecializations(tenantId);
    } catch (error: any) {
      moduleLogger.error("Error getting specializations:", error);
      throw error;
    }
  }

  async toggleAcceptingAppointments(doctorId: string, tenantId: string, updatedBy: string): Promise<DoctorEntity> {
    try {
      const doctor = await this.doctorRepository.toggleAcceptingAppointments(doctorId, tenantId);

      // Publish domain event
      const statusChangedEvent = eventBus.createEvent(
        EventTypes.DOCTOR_STATUS_CHANGED,
        tenantId,
        doctorId,
        "doctor",
        {
          doctorId,
          isAcceptingAppointments: doctor.isAcceptingAppointments,
          action: "appointment_acceptance_toggled",
        },
        1,
        updatedBy
      );

      await eventBus.publish(statusChangedEvent);

      moduleLogger.info(
        {
          doctorId,
          tenantId,
          isAcceptingAppointments: doctor.isAcceptingAppointments,
          updatedBy,
        },
        "Doctor appointment acceptance status toggled"
      );

      return doctor;
    } catch (error: any) {
      moduleLogger.error("Error toggling appointment acceptance:", error);
      throw error;
    }
  }

  // Availability management methods
  async setWeeklySchedule(
    doctorId: string,
    schedule: WeeklyScheduleSlot[],
    tenantId: string,
    updatedBy: string
  ): Promise<void> {
    try {
      // Validate schedule
      this.validateWeeklySchedule(schedule);

      // Convert to repository format
      const scheduleData = schedule.map((slot) => ({
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
      }));

      // Update schedule
      await this.availabilityRepository.setWeeklySchedule(doctorId, scheduleData, tenantId);

      // Publish domain event
      const availabilityUpdatedEvent = eventBus.createEvent(
        EventTypes.DOCTOR_AVAILABILITY_UPDATED,
        tenantId,
        doctorId,
        "doctor",
        {
          doctorId,
          availabilityType: "weekly",
          changes: {
            updated: scheduleData,
          },
        },
        1,
        updatedBy
      );

      await eventBus.publish(availabilityUpdatedEvent);

      moduleLogger.info(
        {
          doctorId,
          tenantId,
          scheduleSlots: schedule.length,
          updatedBy,
        },
        "Doctor weekly schedule updated"
      );
    } catch (error: any) {
      moduleLogger.error("Error setting weekly schedule:", error);
      throw error;
    }
  }

  async getDoctorAvailability(doctorId: string, tenantId: string): Promise<DoctorAvailabilityEntity[]> {
    try {
      return await this.availabilityRepository.findDoctorAvailability(doctorId, tenantId);
    } catch (error: any) {
      moduleLogger.error("Error getting doctor availability:", error);
      throw error;
    }
  }

  async createAvailabilityOverride(
    doctorId: string,
    request: AvailabilityOverrideRequest,
    tenantId: string,
    createdBy: string
  ): Promise<AvailabilityOverrideEntity> {
    try {
      // Validate request
      this.validateAvailabilityOverrideRequest(request);

      const overrideData: CreateAvailabilityOverrideData = {
        tenantId,
        doctorId,
        date: new Date(request.date),
        startTime: request.startTime,
        endTime: request.endTime,
        isAvailable: request.isAvailable,
        reason: request.reason,
      };

      const override = await this.availabilityRepository.createOverride(overrideData);

      // Publish domain event
      const availabilityUpdatedEvent = eventBus.createEvent(
        EventTypes.DOCTOR_AVAILABILITY_UPDATED,
        tenantId,
        doctorId,
        "doctor",
        {
          doctorId,
          availabilityType: "override",
          changes: {
            added: [overrideData],
          },
        },
        1,
        createdBy
      );

      await eventBus.publish(availabilityUpdatedEvent);

      moduleLogger.info(
        {
          doctorId,
          date: request.date,
          isAvailable: request.isAvailable,
          tenantId,
          createdBy,
        },
        "Availability override created"
      );

      return override;
    } catch (error: any) {
      moduleLogger.error("Error creating availability override:", error);
      throw error;
    }
  }

  async getAvailabilityOverrides(
    doctorId: string,
    startDate: Date,
    endDate: Date,
    tenantId: string
  ): Promise<AvailabilityOverrideEntity[]> {
    try {
      return await this.availabilityRepository.findOverridesByDateRange(doctorId, startDate, endDate, tenantId);
    } catch (error: any) {
      moduleLogger.error("Error getting availability overrides:", error);
      throw error;
    }
  }

  async deleteAvailabilityOverride(overrideId: string, tenantId: string, deletedBy: string): Promise<void> {
    try {
      const override = await this.availabilityRepository.findOverrideById(overrideId, tenantId);
      if (!override) {
        throw new NotFoundError("Availability override not found");
      }

      await this.availabilityRepository.deleteOverride(overrideId, tenantId);

      // Publish domain event
      const availabilityUpdatedEvent = eventBus.createEvent(
        EventTypes.DOCTOR_AVAILABILITY_UPDATED,
        tenantId,
        override.doctorId,
        "doctor",
        {
          doctorId: override.doctorId,
          availabilityType: "override",
          changes: {
            removed: [{ id: overrideId, date: override.date }],
          },
        },
        1,
        deletedBy
      );

      await eventBus.publish(availabilityUpdatedEvent);

      moduleLogger.info(
        {
          overrideId,
          doctorId: override.doctorId,
          tenantId,
          deletedBy,
        },
        "Availability override deleted"
      );
    } catch (error: any) {
      moduleLogger.error("Error deleting availability override:", error);
      throw error;
    }
  }

  async getDoctorStats(tenantId: string): Promise<any> {
    try {
      return await this.doctorRepository.getStats(tenantId);
    } catch (error: any) {
      moduleLogger.error("Error getting doctor stats:", error);
      throw error;
    }
  }

  // Private validation methods
  private validateCreateDoctorRequest(request: CreateDoctorProfileRequest): void {
    if (!request.userId) {
      throw new ValidationError("User ID is required");
    }

    if (!request.specialization || request.specialization.trim().length === 0) {
      throw new ValidationError("Specialization is required");
    }

    if (request.specialization.length > 255) {
      throw new ValidationError("Specialization cannot exceed 255 characters");
    }

    if (request.consultationFee !== undefined && request.consultationFee < 0) {
      throw new ValidationError("Consultation fee cannot be negative");
    }

    if (request.consultationDuration !== undefined) {
      if (request.consultationDuration < 15 || request.consultationDuration > 240) {
        throw new ValidationError("Consultation duration must be between 15 and 240 minutes");
      }
    }

    if (request.bio && request.bio.length > 2000) {
      throw new ValidationError("Bio cannot exceed 2000 characters");
    }
  }

  private validateUpdateDoctorRequest(request: UpdateDoctorProfileRequest): void {
    if (request.specialization !== undefined) {
      if (!request.specialization || request.specialization.trim().length === 0) {
        throw new ValidationError("Specialization cannot be empty");
      }
      if (request.specialization.length > 255) {
        throw new ValidationError("Specialization cannot exceed 255 characters");
      }
    }

    if (request.consultationFee !== undefined && request.consultationFee < 0) {
      throw new ValidationError("Consultation fee cannot be negative");
    }

    if (request.consultationDuration !== undefined) {
      if (request.consultationDuration < 15 || request.consultationDuration > 240) {
        throw new ValidationError("Consultation duration must be between 15 and 240 minutes");
      }
    }

    if (request.bio !== undefined && request.bio && request.bio.length > 2000) {
      throw new ValidationError("Bio cannot exceed 2000 characters");
    }
  }

  private validateWeeklySchedule(schedule: WeeklyScheduleSlot[]): void {
    if (!Array.isArray(schedule)) {
      throw new ValidationError("Schedule must be an array");
    }

    for (const slot of schedule) {
      if (!Object.values(DayOfWeek).includes(slot.dayOfWeek)) {
        throw new ValidationError(`Invalid day of week: ${slot.dayOfWeek}`);
      }

      if (!isValidTimeString(slot.startTime)) {
        throw new ValidationError(`Invalid start time format: ${slot.startTime}`);
      }

      if (!isValidTimeString(slot.endTime)) {
        throw new ValidationError(`Invalid end time format: ${slot.endTime}`);
      }

      const startMinutes = this.timeToMinutes(slot.startTime);
      const endMinutes = this.timeToMinutes(slot.endTime);

      if (endMinutes <= startMinutes) {
        throw new ValidationError("End time must be after start time");
      }
    }

    // Check for overlapping slots on the same day
    const daySlots = new Map<DayOfWeek, WeeklyScheduleSlot[]>();
    for (const slot of schedule) {
      if (!daySlots.has(slot.dayOfWeek)) {
        daySlots.set(slot.dayOfWeek, []);
      }
      daySlots.get(slot.dayOfWeek)!.push(slot);
    }

    for (const [day, slots] of daySlots.entries()) {
      if (slots.length > 1) {
        // Check for overlaps
        slots.sort((a, b) => this.timeToMinutes(a.startTime) - this.timeToMinutes(b.startTime));

        for (let i = 0; i < slots.length - 1; i++) {
          const currentEnd = this.timeToMinutes(slots[i]!.endTime);
          const nextStart = this.timeToMinutes(slots[i + 1]!.startTime);

          if (currentEnd > nextStart) {
            throw new ValidationError(`Overlapping time slots found on day ${day}`);
          }
        }
      }
    }
  }

  private validateAvailabilityOverrideRequest(request: AvailabilityOverrideRequest): void {
    // Validate date
    const date = new Date(request.date);
    if (isNaN(date.getTime())) {
      throw new ValidationError("Invalid date format");
    }

    // Check if date is not in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) {
      throw new ValidationError("Cannot create availability override for past dates");
    }

    // If times are provided, validate them
    if (request.startTime && !isValidTimeString(request.startTime)) {
      throw new ValidationError("Invalid start time format");
    }

    if (request.endTime && !isValidTimeString(request.endTime)) {
      throw new ValidationError("Invalid end time format");
    }

    // If both times are provided, validate the range
    if (request.startTime && request.endTime) {
      const startMinutes = this.timeToMinutes(request.startTime);
      const endMinutes = this.timeToMinutes(request.endTime);

      if (endMinutes <= startMinutes) {
        throw new ValidationError("End time must be after start time");
      }
    }

    // For available overrides, times should be provided
    if (request.isAvailable && (!request.startTime || !request.endTime)) {
      throw new ValidationError("Start time and end time are required for available overrides");
    }

    // Validate reason length
    if (request.reason && request.reason.length > 500) {
      throw new ValidationError("Reason cannot exceed 500 characters");
    }
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(":").map(Number);
    return hours! * 60 + minutes!;
  }
}
