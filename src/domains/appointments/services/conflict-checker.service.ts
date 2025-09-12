import { createModuleLogger } from "@/shared/config/logger";
import { AppointmentStatus, ConflictError } from "@/shared/types/common.types";
import { AppointmentRepository } from "../repositories/appointment.repository";
import { timeStringToMinutes } from "@/shared/utils/date";

const moduleLogger = createModuleLogger("ConflictCheckerService");

export interface ConflictCheckRequest {
  doctorId: string;
  patientId: string;
  appointmentDate: Date;
  startTime: string;
  endTime: string;
  tenantId: string;
  excludeAppointmentId?: string;
}

export interface ConflictDetails {
  type: "doctor" | "patient";
  conflictingAppointmentId: string;
  conflictingStartTime: string;
  conflictingEndTime: string;
  message: string;
}

export class ConflictCheckerService {
  constructor(private appointmentRepository: AppointmentRepository) {}

  async checkForConflicts(request: ConflictCheckRequest): Promise<void> {
    try {
      // Find potentially conflicting appointments
      const conflictingAppointments = await this.appointmentRepository.findConflicting(
        request.doctorId,
        request.patientId,
        request.appointmentDate,
        request.startTime,
        request.endTime,
        request.tenantId,
        request.excludeAppointmentId
      );

      if (conflictingAppointments.length === 0) {
        return; // No conflicts
      }

      // Analyze conflicts and throw appropriate errors
      const conflicts = this.analyzeConflicts(conflictingAppointments, request);

      if (conflicts.length > 0) {
        const conflict = conflicts[0]; // Report the first conflict
        throw new ConflictError(conflict?.message);
      }
    } catch (error: any) {
      if (error instanceof ConflictError) {
        moduleLogger.warn(
          {
            doctorId: request.doctorId,
            patientId: request.patientId,
            appointmentDate: request.appointmentDate,
            startTime: request.startTime,
            endTime: request.endTime,
            error: error.message,
          },
          "Appointment conflict detected:"
        );
      } else {
        moduleLogger.error("Error checking for conflicts:", error);
      }
      throw error;
    }
  }

  async checkDoctorAvailability(
    doctorId: string,
    appointmentDate: Date,
    startTime: string,
    endTime: string,
    tenantId: string
  ): Promise<boolean> {
    try {
      // Check if doctor has availability for this day/time
      // This would integrate with doctor availability system

      // For now, just check for conflicting appointments
      const conflicts = await this.appointmentRepository.findConflicting(
        doctorId,
        "", // Empty patient ID to only check doctor conflicts
        appointmentDate,
        startTime,
        endTime,
        tenantId
      );

      return conflicts.length === 0;
    } catch (error: any) {
      moduleLogger.error("Error checking doctor availability:", error);
      throw error;
    }
  }

  async findAvailableSlots(
    doctorId: string,
    appointmentDate: Date,
    duration: number, // in minutes
    tenantId: string
  ): Promise<{ startTime: string; endTime: string }[]> {
    try {
      // Get all appointments for the doctor on this date
      const existingAppointments = await this.appointmentRepository.findByDoctor(doctorId, tenantId, {
        startDate: appointmentDate,
        endDate: appointmentDate,
        status: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED, AppointmentStatus.IN_PROGRESS],
      });

      // Define working hours (this could be made configurable per doctor)
      const workingStart = 8 * 60; // 8:00 AM in minutes
      const workingEnd = 18 * 60; // 6:00 PM in minutes

      // Create a list of occupied time slots
      const occupiedSlots = existingAppointments
        .map((appointment) => ({
          start: timeStringToMinutes(appointment.getRawData().startTime),
          end: timeStringToMinutes(appointment.getRawData().endTime),
        }))
        .sort((a, b) => a.start - b.start);

      // Find available slots
      const availableSlots: { startTime: string; endTime: string }[] = [];
      let currentTime = workingStart;

      for (const occupiedSlot of occupiedSlots) {
        // Check if there's a gap before this occupied slot
        if (currentTime + duration <= occupiedSlot.start) {
          // Found a slot before the occupied time
          const slotEnd = Math.min(occupiedSlot.start, currentTime + duration);
          availableSlots.push({
            startTime: this.minutesToTimeString(currentTime),
            endTime: this.minutesToTimeString(slotEnd),
          });
        }
        currentTime = Math.max(currentTime, occupiedSlot.end);
      }

      // Check for availability after the last appointment
      if (currentTime + duration <= workingEnd) {
        availableSlots.push({
          startTime: this.minutesToTimeString(currentTime),
          endTime: this.minutesToTimeString(currentTime + duration),
        });
      }

      return availableSlots;
    } catch (error: any) {
      moduleLogger.error("Error finding available slots:", error);
      throw error;
    }
  }

  async getNextAvailableSlot(
    doctorId: string,
    startDate: Date,
    duration: number,
    tenantId: string,
    maxDaysToCheck: number = 30
  ): Promise<{ date: Date; startTime: string; endTime: string } | null> {
    try {
      const currentDate = new Date(startDate);

      for (let i = 0; i < maxDaysToCheck; i++) {
        // Skip weekends (this could be made configurable)
        if (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        const availableSlots = await this.findAvailableSlots(doctorId, currentDate, duration, tenantId);

        if (availableSlots.length > 0) {
          const slot = availableSlots[0]; // Return the first available slot
          return {
            date: new Date(currentDate),
            startTime: slot!.startTime,
            endTime: slot!.endTime,
          };
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      return null; // No available slot found within the specified period
    } catch (error: any) {
      moduleLogger.error("Error finding next available slot:", error);
      throw error;
    }
  }

  private analyzeConflicts(conflictingAppointments: any[], request: ConflictCheckRequest): ConflictDetails[] {
    const conflicts: ConflictDetails[] = [];

    for (const appointment of conflictingAppointments) {
      const appointmentData = appointment.getRawData();

      if (appointmentData.doctorId === request.doctorId) {
        conflicts.push({
          type: "doctor",
          conflictingAppointmentId: appointmentData.id,
          conflictingStartTime: appointmentData.startTime,
          conflictingEndTime: appointmentData.endTime,
          message: `Doctor already has an appointment from ${appointmentData.startTime} to ${appointmentData.endTime}`,
        });
      }

      if (appointmentData.patientId === request.patientId) {
        conflicts.push({
          type: "patient",
          conflictingAppointmentId: appointmentData.id,
          conflictingStartTime: appointmentData.startTime,
          conflictingEndTime: appointmentData.endTime,
          message: `Patient already has an appointment from ${appointmentData.startTime} to ${appointmentData.endTime}`,
        });
      }
    }

    return conflicts;
  }

  private minutesToTimeString(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
  }

  // Additional validation methods
  async validateAppointmentTiming(
    startTime: string,
    endTime: string,
    minimumDuration: number = 15 // minimum 15 minutes
  ): Promise<void> {
    const startMinutes = timeStringToMinutes(startTime);
    const endMinutes = timeStringToMinutes(endTime);
    const duration = endMinutes - startMinutes;

    if (duration < minimumDuration) {
      throw new ConflictError(`Appointment must be at least ${minimumDuration} minutes long`);
    }

    if (duration > 240) {
      // Maximum 4 hours
      throw new ConflictError("Appointment cannot be longer than 4 hours");
    }

    // Check if times are on 15-minute boundaries (business rule)
    if (startMinutes % 15 !== 0 || endMinutes % 15 !== 0) {
      throw new ConflictError("Appointment times must be on 15-minute boundaries");
    }
  }

  async validateBusinessRules(request: ConflictCheckRequest): Promise<void> {
    // Check minimum advance booking time (e.g., 2 hours)
    const now = new Date();
    const appointmentDateTime = new Date(request.appointmentDate);
    const [hours, minutes] = request.startTime.split(":").map(Number);
    appointmentDateTime.setHours(hours!, minutes, 0, 0);

    const timeDiffInHours = (appointmentDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (timeDiffInHours < 2) {
      throw new ConflictError("Appointments must be scheduled at least 2 hours in advance");
    }

    // Check maximum advance booking time (e.g., 90 days)
    const maxAdvanceDays = 90;
    const maxAdvanceTime = maxAdvanceDays * 24;

    if (timeDiffInHours > maxAdvanceTime) {
      throw new ConflictError(`Appointments cannot be scheduled more than ${maxAdvanceDays} days in advance`);
    }

    // Validate appointment timing
    await this.validateAppointmentTiming(request.startTime, request.endTime);
  }
}
