import { Socket } from "socket.io";
import { createModuleLogger, logWebSocketEvent } from "@/shared/config/logger";
import { eventBus, EventTypes } from "@/shared/events/event-bus";

const moduleLogger = createModuleLogger("AppointmentSocketHandler");

interface AuthenticatedSocket extends Socket {
  userId: string;
  tenantId: string;
  role: string;
  sessionId: string;
}

export class AppointmentSocketHandler {
  constructor(private socket: AuthenticatedSocket) {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Listen for appointment-related events from clients
    this.socket.on("join_appointment", this.handleJoinAppointment.bind(this));
    this.socket.on("leave_appointment", this.handleLeaveAppointment.bind(this));
    this.socket.on("appointment_status_update", this.handleAppointmentStatusUpdate.bind(this));
    this.socket.on("appointment_note_update", this.handleAppointmentNoteUpdate.bind(this));

    // Listen for domain events to broadcast to clients
    eventBus.on(EventTypes.APPOINTMENT_CREATED, this.handleAppointmentCreated.bind(this));
    eventBus.on(EventTypes.APPOINTMENT_UPDATED, this.handleAppointmentUpdated.bind(this));
    eventBus.on(EventTypes.APPOINTMENT_CANCELLED, this.handleAppointmentCancelled.bind(this));
    eventBus.on(EventTypes.APPOINTMENT_CONFIRMED, this.handleAppointmentConfirmed.bind(this));
  }

  private async handleJoinAppointment(appointmentId: string): Promise<void> {
    try {
      // TODO: Verify user has access to this appointment
      // This would typically involve checking the database

      this.socket.join(`appointment:${appointmentId}`);

      logWebSocketEvent("joined_appointment_room", { appointmentId, userId: this.socket.userId }, this.socket.id);

      this.socket.emit("appointment_joined", {
        appointmentId,
        message: "Successfully joined appointment room",
        timestamp: new Date(),
      });
    } catch (error: any) {
      moduleLogger.error("Failed to join appointment room:", error);
      this.socket.emit("error", {
        type: "join_appointment_failed",
        message: "Failed to join appointment room",
        appointmentId,
      });
    }
  }

  private async handleLeaveAppointment(appointmentId: string): Promise<void> {
    try {
      this.socket.leave(`appointment:${appointmentId}`);

      logWebSocketEvent("left_appointment_room", { appointmentId, userId: this.socket.userId }, this.socket.id);

      this.socket.emit("appointment_left", {
        appointmentId,
        message: "Successfully left appointment room",
        timestamp: new Date(),
      });
    } catch (error: any) {
      moduleLogger.error("Failed to leave appointment room:", error);
    }
  }

  private async handleAppointmentStatusUpdate(data: any): Promise<void> {
    try {
      const { appointmentId, status, notes } = data;

      // TODO: Validate user permissions and update appointment in database
      // For now, just broadcast the update

      this.socket.to(`appointment:${appointmentId}`).emit("appointment_status_updated", {
        appointmentId,
        status,
        notes,
        updatedBy: this.socket.userId,
        timestamp: new Date(),
      });

      logWebSocketEvent(
        "appointment_status_updated",
        { appointmentId, status, updatedBy: this.socket.userId },
        this.socket.id
      );
    } catch (error: any) {
      moduleLogger.error("Failed to update appointment status:", error);
      this.socket.emit("error", {
        type: "appointment_update_failed",
        message: "Failed to update appointment status",
      });
    }
  }

  private async handleAppointmentNoteUpdate(data: any): Promise<void> {
    try {
      const { appointmentId, notes } = data;

      // TODO: Validate user permissions and save notes to database
      // Only doctors should be able to add/update notes

      if (this.socket.role !== "doctor") {
        this.socket.emit("error", {
          type: "permission_denied",
          message: "Only doctors can update appointment notes",
        });
        return;
      }

      this.socket.to(`appointment:${appointmentId}`).emit("appointment_notes_updated", {
        appointmentId,
        notes,
        updatedBy: this.socket.userId,
        timestamp: new Date(),
      });

      logWebSocketEvent("appointment_notes_updated", { appointmentId, updatedBy: this.socket.userId }, this.socket.id);
    } catch (error: any) {
      moduleLogger.error("Failed to update appointment notes:", error);
      this.socket.emit("error", {
        type: "notes_update_failed",
        message: "Failed to update appointment notes",
      });
    }
  }

  // Domain event handlers
  private handleAppointmentCreated(event: any): void {
    const { appointmentId, doctorId, patientId } = event.data;

    // Notify doctor
    this.socket.to(`user:${doctorId}`).emit("appointment_created", {
      type: "appointment_created",
      appointment: event.data,
      message: "New appointment scheduled",
      timestamp: new Date(),
    });

    // Notify patient
    this.socket.to(`user:${patientId}`).emit("appointment_created", {
      type: "appointment_created",
      appointment: event.data,
      message: "Your appointment has been scheduled",
      timestamp: new Date(),
    });
  }

  private handleAppointmentUpdated(event: any): void {
    const { appointmentId, doctorId, patientId, changes } = event.data;

    const updateData = {
      type: "appointment_updated",
      appointmentId,
      changes,
      updatedBy: event.userId,
      message: "Appointment has been updated",
      timestamp: new Date(),
    };

    // Notify both parties
    this.socket.to(`user:${doctorId}`).emit("appointment_updated", updateData);
    this.socket.to(`user:${patientId}`).emit("appointment_updated", updateData);

    // Notify appointment room
    this.socket.to(`appointment:${appointmentId}`).emit("appointment_updated", updateData);
  }

  private handleAppointmentCancelled(event: any): void {
    const { appointmentId, doctorId, patientId, cancellationReason } = event.data;

    const cancelData = {
      type: "appointment_cancelled",
      appointmentId,
      cancellationReason,
      cancelledBy: event.userId,
      message: "Appointment has been cancelled",
      timestamp: new Date(),
    };

    // Notify both parties
    this.socket.to(`user:${doctorId}`).emit("appointment_cancelled", cancelData);
    this.socket.to(`user:${patientId}`).emit("appointment_cancelled", cancelData);

    // Notify appointment room
    this.socket.to(`appointment:${appointmentId}`).emit("appointment_cancelled", cancelData);
  }

  private handleAppointmentConfirmed(event: any): void {
    const { appointmentId, doctorId, patientId } = event.data;

    const confirmData = {
      type: "appointment_confirmed",
      appointmentId,
      confirmedBy: event.userId,
      message: "Appointment has been confirmed",
      timestamp: new Date(),
    };

    // Notify both parties
    this.socket.to(`user:${doctorId}`).emit("appointment_confirmed", confirmData);
    this.socket.to(`user:${patientId}`).emit("appointment_confirmed", confirmData);

    // Notify appointment room
    this.socket.to(`appointment:${appointmentId}`).emit("appointment_confirmed", confirmData);
  }
}
