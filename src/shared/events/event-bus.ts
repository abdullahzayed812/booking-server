import { EventEmitter } from "events";
import { redis } from "@/shared/config/redis";
import { createModuleLogger } from "@/shared/config/logger";
import { DomainEvent } from "@/shared/types/common.types";
import { generateCorrelationId } from "@/shared/utils/crypto";

const moduleLogger = createModuleLogger("EventBus");

export interface EventHandler<T = any> {
  handle(event: DomainEvent): Promise<void>;
}

export class EventBus extends EventEmitter {
  private static instance: EventBus;
  private handlers: Map<string, EventHandler[]> = new Map();

  private constructor() {
    super();
    this.setMaxListeners(100); // Increase max listeners for scalability
  }

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  // Register event handler
  public registerHandler<T = any>(eventType: string, handler: EventHandler<T>): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }

    this.handlers.get(eventType)!.push(handler);

    moduleLogger.info(`Handler registered for event: ${eventType}`);
  }

  // Unregister event handler
  public unregisterHandler<T = any>(eventType: string, handler: EventHandler<T>): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
        moduleLogger.info(`Handler unregistered for event: ${eventType}`);
      }
    }
  }

  // Publish domain event locally
  public async publishLocal<T = any>(event: DomainEvent): Promise<void> {
    try {
      const handlers = this.handlers.get(event.type) || [];

      // Execute all handlers concurrently
      const promises = handlers.map(async (handler) => {
        try {
          await handler.handle(event);
          moduleLogger.debug(`Handler executed for event: ${event.type}`, {
            eventId: event.id,
            aggregateId: event.aggregateId,
          });
        } catch (error) {
          moduleLogger.error(`Handler failed for event: ${event.type}`, {
            error,
            eventId: event.id,
            aggregateId: event.aggregateId,
          });
          // Don't throw here to allow other handlers to complete
        }
      });

      await Promise.all(promises);

      // Also emit through EventEmitter for additional listeners
      this.emit(event.type, event);
    } catch (error) {
      moduleLogger.error("Failed to publish local event:", error);
      throw error;
    }
  }

  // Publish domain event to Redis for cross-service communication
  public async publishDistributed<T = any>(event: DomainEvent<T>): Promise<void> {
    try {
      // Publish to Redis pub/sub for distributed handling
      await redis.publish(`domain_events:${event.tenantId}`, {
        ...event,
        publishedAt: new Date(),
      });

      // Also store in Redis stream for reliability (optional)
      await redis.getClient().xAdd(`events:${event.tenantId}:${event.aggregateType}`, "*", {
        eventId: event.id,
        eventType: event.type,
        aggregateId: event.aggregateId,
        data: JSON.stringify(event.data),
        version: event.version.toString(),
        timestamp: event.timestamp.toISOString(),
        userId: event.userId || "",
        correlationId: event.correlationId || "",
      });

      moduleLogger.info(`Distributed event published: ${event.type}`, {
        eventId: event.id,
        tenantId: event.tenantId,
        aggregateId: event.aggregateId,
      });
    } catch (error) {
      moduleLogger.error("Failed to publish distributed event:", error);
      throw error;
    }
  }

  // Publish both locally and distributed
  public async publish<T = any>(event: DomainEvent): Promise<void> {
    // Execute local handlers first
    await this.publishLocal(event);

    // Then publish for distributed handling
    await this.publishDistributed(event);
  }

  // Subscribe to distributed events
  public async subscribeToDistributedEvents(tenantId: string): Promise<void> {
    try {
      await redis.subscribe(`domain_events:${tenantId}`, async (message) => {
        try {
          const event = JSON.parse(message) as DomainEvent;

          // Handle distributed event locally
          await this.publishLocal(event);
        } catch (error: any) {
          moduleLogger.error("Failed to handle distributed event:", error);
        }
      });

      moduleLogger.info(`Subscribed to distributed events for tenant: ${tenantId}`);
    } catch (error: any) {
      moduleLogger.error("Failed to subscribe to distributed events:", error);
      throw error;
    }
  }

  // Create domain event
  public createEvent<T = any>(
    type: string,
    tenantId: string,
    aggregateId: string,
    aggregateType: string,
    data: T,
    version: number = 1,
    userId?: string,
    correlationId?: string
  ): DomainEvent {
    return {
      id: generateCorrelationId(),
      type,
      tenantId,
      aggregateId,
      aggregateType,
      data,
      version,
      timestamp: new Date(),
      userId,
      correlationId: correlationId || generateCorrelationId(),
    };
  }
}

// Export singleton instance
export const eventBus = EventBus.getInstance();

// Event types constants
export const EventTypes = {
  // User events
  USER_CREATED: "user.created",
  USER_UPDATED: "user.updated",
  USER_DELETED: "user.deleted",
  USER_LOGIN: "user.login",
  USER_LOGOUT: "user.logout",

  // Appointment events
  APPOINTMENT_CREATED: "appointment.created",
  APPOINTMENT_UPDATED: "appointment.updated",
  APPOINTMENT_CANCELLED: "appointment.cancelled",
  APPOINTMENT_CONFIRMED: "appointment.confirmed",
  APPOINTMENT_COMPLETED: "appointment.completed",
  APPOINTMENT_NO_SHOW: "appointment.no_show",

  // Doctor events
  DOCTOR_AVAILABILITY_UPDATED: "doctor.availability.updated",
  DOCTOR_PROFILE_UPDATED: "doctor.profile.updated",
  DOCTOR_STATUS_CHANGED: "doctor.status.changed",

  // Patient events
  PATIENT_CREATED: "patient.created",
  PATIENT_UPDATED: "patient.updated",

  // Medical note events
  MEDICAL_NOTE_CREATED: "medical_note.created",
  MEDICAL_NOTE_UPDATED: "medical_note.updated",

  // Notification events
  NOTIFICATION_CREATED: "notification.created",
  NOTIFICATION_SENT: "notification.sent",
  NOTIFICATION_FAILED: "notification.failed",

  // System events
  TENANT_CREATED: "tenant.created",
  TENANT_UPDATED: "tenant.updated",
} as const;

// Example event handlers

// Appointment created handler - sends notifications
export class AppointmentCreatedHandler implements EventHandler {
  async handle(event: DomainEvent): Promise<void> {
    const { doctorId, patientId, appointmentDate, startTime } = event.data;

    // Create notifications for doctor and patient
    const doctorNotificationEvent = eventBus.createEvent(
      EventTypes.NOTIFICATION_CREATED,
      event.tenantId,
      doctorId,
      "user",
      {
        userId: doctorId,
        type: "appointment_created",
        title: "New Appointment Scheduled",
        message: `You have a new appointment scheduled for ${appointmentDate} at ${startTime}`,
        channels: ["email", "push", "in_app"],
        data: { appointmentId: event.aggregateId },
      },
      1,
      event.userId,
      event.correlationId
    );

    const patientNotificationEvent = eventBus.createEvent(
      EventTypes.NOTIFICATION_CREATED,
      event.tenantId,
      patientId,
      "user",
      {
        userId: patientId,
        type: "appointment_created",
        title: "Appointment Confirmed",
        message: `Your appointment has been scheduled for ${appointmentDate} at ${startTime}`,
        channels: ["email", "sms", "push", "in_app"],
        data: { appointmentId: event.aggregateId },
      },
      1,
      event.userId,
      event.correlationId
    );

    // Publish notification events
    await eventBus.publishLocal(doctorNotificationEvent);
    await eventBus.publishLocal(patientNotificationEvent);
  }
}

// Register default handlers
eventBus.registerHandler(EventTypes.APPOINTMENT_CREATED, new AppointmentCreatedHandler());
