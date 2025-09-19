import { createModuleLogger } from "@/shared/config/logger";
import { ValidationError, NotFoundError, AppointmentStatus } from "@/shared/types/common.types";
import { UserRole } from "@/shared/types/common.types";
import { eventBus, EventTypes } from "@/shared/events/event-bus";
import { AppointmentRepository, DashboardStats } from "../repositories/appointment.repository";
import { ConflictCheckerService } from "./conflict-checker.service";
import {
  AppointmentEntity,
  CreateAppointmentData,
  UpdateAppointmentData,
  AppointmentWithDetails,
} from "../models/appointment.model";
import { isValidTimeString, parseDate, isDateInPast } from "@/shared/utils/date";

const moduleLogger = createModuleLogger("AppointmentService");

export interface CreateAppointmentRequest {
  doctorId: string;
  patientId?: string; // Optional if current user is patient
  appointmentDate: string; // YYYY-MM-DD format
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
  reasonForVisit?: string;
}

export interface UpdateAppointmentRequest {
  appointmentDate?: string;
  startTime?: string;
  endTime?: string;
  reasonForVisit?: string;
  notes?: string;
}

export interface AppointmentFilters {
  doctorId?: string;
  patientId?: string;
  status?: AppointmentStatus[];
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export class AppointmentService {
  constructor(private appointmentRepository: AppointmentRepository, private conflictChecker: ConflictCheckerService) {}

  async createAppointment(
    request: CreateAppointmentRequest,
    tenantId: string,
    userId: string,
    userRole: UserRole
  ): Promise<AppointmentWithDetails> {
    try {
      // Validate input
      this.validateCreateAppointmentRequest(request);

      // Determine patient ID
      let patientId = request.patientId;
      if (userRole === UserRole.PATIENT) {
        patientId = userId; // Patients can only book for themselves
      } else if (!patientId) {
        throw new ValidationError("Patient ID is required");
      }

      // Validate appointment date and time
      const appointmentDate = parseDate(request.appointmentDate);
      if (isDateInPast(appointmentDate)) {
        throw new ValidationError("Cannot schedule appointments in the past");
      }

      // Check if appointment is within business hours (you could make this configurable per tenant)
      this.validateBusinessHours(request.startTime, request.endTime);

      // Check for conflicts
      await this.conflictChecker.checkForConflicts({
        doctorId: request.doctorId,
        patientId,
        appointmentDate,
        startTime: request.startTime,
        endTime: request.endTime,
        tenantId,
      });

      // Create appointment data
      const appointmentData: CreateAppointmentData = {
        tenantId,
        doctorId: request.doctorId,
        patientId,
        appointmentDate,
        startTime: request.startTime,
        endTime: request.endTime,
        reasonForVisit: request.reasonForVisit,
      };

      // Create appointment
      const appointment = await this.appointmentRepository.create(appointmentData);

      // Get appointment with details for response
      const appointmentWithDetails = await this.appointmentRepository.findWithDetails(appointment.id, tenantId);
      if (!appointmentWithDetails) {
        throw new Error("Failed to retrieve created appointment");
      }

      // Publish domain event
      const appointmentCreatedEvent = eventBus.createEvent(
        EventTypes.APPOINTMENT_CREATED,
        tenantId,
        appointment.id,
        "appointment",
        {
          appointmentId: appointment.id,
          doctorId: request.doctorId,
          patientId,
          appointmentDate: request.appointmentDate,
          startTime: request.startTime,
          endTime: request.endTime,
          reasonForVisit: request.reasonForVisit,
        },
        1,
        userId
      );

      await eventBus.publish(appointmentCreatedEvent);

      moduleLogger.info(
        {
          appointmentId: appointment.id,
          doctorId: request.doctorId,
          patientId,
          tenantId,
          createdBy: userId,
        },
        "Appointment created successfully"
      );

      return appointmentWithDetails;
    } catch (error: any) {
      moduleLogger.error("Error creating appointment:", error);
      throw error;
    }
  }

  async updateAppointment(
    appointmentId: string,
    request: UpdateAppointmentRequest,
    tenantId: string,
    userId: string
  ): Promise<AppointmentWithDetails> {
    try {
      // Get existing appointment
      const existingAppointment = await this.appointmentRepository.findById(appointmentId, tenantId);
      if (!existingAppointment) {
        throw new NotFoundError("Appointment not found");
      }

      // Validate that user can update this appointment
      this.validateUpdatePermissions(existingAppointment, userId);

      // Prepare update data
      const updateData: UpdateAppointmentData = {};

      if (request.appointmentDate || request.startTime || request.endTime) {
        // If changing time/date, validate and check conflicts
        const newDate = request.appointmentDate
          ? parseDate(request.appointmentDate)
          : existingAppointment.appointmentDateTime;
        const newStartTime = request.startTime || existingAppointment.getRawData().startTime;
        const newEndTime = request.endTime || existingAppointment.getRawData().endTime;

        if (request.appointmentDate && isDateInPast(newDate)) {
          throw new ValidationError("Cannot reschedule appointment to the past");
        }

        this.validateBusinessHours(newStartTime, newEndTime);

        // Check for conflicts (excluding current appointment)
        await this.conflictChecker.checkForConflicts({
          doctorId: existingAppointment.doctorId,
          patientId: existingAppointment.patientId,
          appointmentDate: newDate,
          startTime: newStartTime,
          endTime: newEndTime,
          tenantId,
          excludeAppointmentId: appointmentId,
        });

        updateData.appointmentDate = newDate;
        updateData.startTime = newStartTime;
        updateData.endTime = newEndTime;
      }

      if (request.reasonForVisit !== undefined) {
        updateData.reasonForVisit = request.reasonForVisit;
      }

      if (request.notes !== undefined) {
        updateData.notes = request.notes;
      }

      // Update appointment
      const updatedAppointment = await this.appointmentRepository.update(appointmentId, updateData, tenantId);

      // Get updated appointment with details
      const appointmentWithDetails = await this.appointmentRepository.findWithDetails(appointmentId, tenantId);
      if (!appointmentWithDetails) {
        throw new Error("Failed to retrieve updated appointment");
      }

      // Publish domain event
      const appointmentUpdatedEvent = eventBus.createEvent(
        EventTypes.APPOINTMENT_UPDATED,
        tenantId,
        appointmentId,
        "appointment",
        {
          appointmentId,
          doctorId: updatedAppointment.doctorId,
          patientId: updatedAppointment.patientId,
          changes: updateData,
          updatedBy: userId,
        },
        1,
        userId
      );

      await eventBus.publish(appointmentUpdatedEvent);

      moduleLogger.info(
        {
          appointmentId,
          tenantId,
          updatedBy: userId,
          changes: Object.keys(updateData),
        },
        "Appointment updated successfully"
      );

      return appointmentWithDetails;
    } catch (error: any) {
      moduleLogger.error("Error updating appointment:", error);
      throw error;
    }
  }

  async cancelAppointment(appointmentId: string, reason: string, tenantId: string, userId: string): Promise<void> {
    try {
      const appointment = await this.appointmentRepository.findById(appointmentId, tenantId);
      if (!appointment) {
        throw new NotFoundError("Appointment not found");
      }

      if (!appointment.canBeCancelled()) {
        throw new ValidationError("Appointment cannot be cancelled in current state");
      }

      // Cancel the appointment
      appointment.cancel(reason, userId);
      await this.appointmentRepository.update(
        appointmentId,
        {
          status: appointment.status,
          cancellationReason: reason,
          cancelledBy: userId,
          cancelledAt: new Date(),
        },
        tenantId
      );

      // Publish domain event
      const appointmentCancelledEvent = eventBus.createEvent(
        EventTypes.APPOINTMENT_CANCELLED,
        tenantId,
        appointmentId,
        "appointment",
        {
          appointmentId,
          doctorId: appointment.doctorId,
          patientId: appointment.patientId,
          cancellationReason: reason,
          cancelledBy: userId,
        },
        1,
        userId
      );

      await eventBus.publish(appointmentCancelledEvent);

      moduleLogger.info(
        {
          appointmentId,
          tenantId,
          cancelledBy: userId,
          reason,
        },
        "Appointment cancelled successfully"
      );
    } catch (error: any) {
      moduleLogger.error("Error cancelling appointment:", error);
      throw error;
    }
  }

  async confirmAppointment(appointmentId: string, tenantId: string, userId: string): Promise<void> {
    try {
      const appointment = await this.appointmentRepository.findById(appointmentId, tenantId);
      if (!appointment) {
        throw new NotFoundError("Appointment not found");
      }

      if (!appointment.canBeConfirmed()) {
        throw new ValidationError("Appointment cannot be confirmed in current state");
      }

      // Confirm the appointment
      appointment.confirm();
      await this.appointmentRepository.update(
        appointmentId,
        {
          status: appointment.status,
          confirmedAt: appointment.getRawData().confirmedAt,
        },
        tenantId
      );

      // Publish domain event
      const appointmentConfirmedEvent = eventBus.createEvent(
        EventTypes.APPOINTMENT_CONFIRMED,
        tenantId,
        appointmentId,
        "appointment",
        {
          appointmentId,
          doctorId: appointment.doctorId,
          patientId: appointment.patientId,
          confirmedBy: userId,
        },
        1,
        userId
      );

      await eventBus.publish(appointmentConfirmedEvent);

      moduleLogger.info(
        {
          appointmentId,
          tenantId,
          confirmedBy: userId,
        },
        "Appointment confirmed successfully"
      );
    } catch (error: any) {
      moduleLogger.error("Error confirming appointment:", error);
      throw error;
    }
  }

  async getAppointment(appointmentId: string, tenantId: string): Promise<AppointmentWithDetails | null> {
    try {
      return await this.appointmentRepository.findWithDetails(appointmentId, tenantId);
    } catch (error: any) {
      moduleLogger.error("Error getting appointment:", error);
      throw error;
    }
  }

  async getAppointments(
    filters: AppointmentFilters,
    tenantId: string
  ): Promise<{ appointments: AppointmentWithDetails[]; total: number }> {
    try {
      const options = {
        ...(filters.startDate && { startDate: parseDate(filters.startDate) }),
        ...(filters.endDate && { endDate: parseDate(filters.endDate) }),
        ...(filters.status && { status: filters.status }),
        limit: filters.limit || 50,
        offset: filters.offset || 0,
      };

      let appointments: AppointmentEntity[] = [];

      if (filters.doctorId) {
        appointments = await this.appointmentRepository.findByDoctor(filters.doctorId, tenantId, options);
      } else if (filters.patientId) {
        appointments = await this.appointmentRepository.findByPatient(filters.patientId, tenantId, options);
      } else {
        // Get all appointments (admin view)
        // This would need a separate repository method
        appointments = [];
      }

      // console.log({ appointments });

      // Convert to detailed appointments
      const detailedAppointments: AppointmentWithDetails[] = [];
      for (const appointment of appointments) {
        const detailed = await this.appointmentRepository.findWithDetails(appointment.id, tenantId);
        if (detailed) {
          detailedAppointments.push(detailed);
        }
      }

      return {
        appointments: detailedAppointments,
        total: detailedAppointments.length, // This should be a separate count query
      };
    } catch (error: any) {
      moduleLogger.error("Error getting appointments:", error);
      throw error;
    }
  }

  async getUpcomingAppointments(tenantId: string, limit?: number): Promise<AppointmentWithDetails[]> {
    try {
      return await this.appointmentRepository.getUpcomingAppointments(tenantId, limit);
    } catch (error: any) {
      moduleLogger.error("Error getting upcoming appointments:", error);
      throw error;
    }
  }

  async getDashboardStats(tenantId: string, userId?: string, userRole?: string): Promise<DashboardStats> {
    try {
      const stats = await this.appointmentRepository.getDashboardStats(tenantId, userId, userRole);

      return stats;
    } catch (error: any) {
      moduleLogger?.error("Error getting dashboard stats:", error);
      throw error;
    }
  }

  private validateCreateAppointmentRequest(request: CreateAppointmentRequest): void {
    if (!request.doctorId) {
      throw new ValidationError("Doctor ID is required");
    }

    if (!request.appointmentDate) {
      throw new ValidationError("Appointment date is required");
    }

    if (!isValidTimeString(request.startTime)) {
      throw new ValidationError("Invalid start time format");
    }

    if (!isValidTimeString(request.endTime)) {
      throw new ValidationError("Invalid end time format");
    }

    // Validate that end time is after start time
    const startMinutes = this.timeToMinutes(request.startTime);
    const endMinutes = this.timeToMinutes(request.endTime);

    if (endMinutes <= startMinutes) {
      throw new ValidationError("End time must be after start time");
    }
  }

  private validateBusinessHours(startTime: string, endTime: string): void {
    // Default business hours: 8 AM to 6 PM
    // This could be made configurable per tenant
    const businessStart = this.timeToMinutes("08:00");
    const businessEnd = this.timeToMinutes("18:00");

    const appointmentStart = this.timeToMinutes(startTime);
    const appointmentEnd = this.timeToMinutes(endTime);

    if (appointmentStart < businessStart || appointmentEnd > businessEnd) {
      throw new ValidationError("Appointment must be within business hours (8 AM - 6 PM)");
    }
  }

  private validateUpdatePermissions(appointment: AppointmentEntity, userId: string): void {
    // Users can only update appointments they are involved in
    if (appointment.doctorId !== userId && appointment.patientId !== userId) {
      throw new ValidationError("You can only update your own appointments");
    }

    // Additional business rules can be added here
    if (appointment.status === AppointmentStatus.COMPLETED) {
      throw new ValidationError("Cannot update completed appointments");
    }

    if (appointment.status === AppointmentStatus.CANCELLED) {
      throw new ValidationError("Cannot update cancelled appointments");
    }
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(":").map(Number);
    return hours! * 60 + minutes!;
  }
}
