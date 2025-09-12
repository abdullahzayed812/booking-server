import { Socket } from "socket.io";
import { createModuleLogger, logWebSocketEvent } from "@/shared/config/logger";
import { eventBus, EventTypes } from "@/shared/events/event-bus";

const moduleLogger = createModuleLogger("NotificationSocketHandler");

interface AuthenticatedSocket extends Socket {
  userId: string;
  tenantId: string;
  role: string;
  sessionId: string;
}

export class NotificationSocketHandler {
  constructor(private socket: AuthenticatedSocket) {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Listen for notification-related events from clients
    this.socket.on("mark_notification_read", this.handleMarkNotificationRead.bind(this));
    this.socket.on("mark_all_notifications_read", this.handleMarkAllNotificationsRead.bind(this));
    this.socket.on("get_notification_count", this.handleGetNotificationCount.bind(this));

    // Listen for domain events to send notifications to clients
    eventBus.on(EventTypes.NOTIFICATION_CREATED, this.handleNotificationCreated.bind(this));
  }

  private async handleMarkNotificationRead(notificationId: string): Promise<void> {
    try {
      // TODO: Update notification as read in database
      // Verify the notification belongs to the current user

      this.socket.emit("notification_marked_read", {
        notificationId,
        timestamp: new Date(),
      });

      logWebSocketEvent("notification_marked_read", { notificationId, userId: this.socket.userId }, this.socket.id);
    } catch (error: any) {
      moduleLogger.error("Failed to mark notification as read:", error);
      this.socket.emit("error", {
        type: "mark_notification_read_failed",
        message: "Failed to mark notification as read",
        notificationId,
      });
    }
  }

  private async handleMarkAllNotificationsRead(): Promise<void> {
    try {
      // TODO: Mark all user notifications as read in database

      this.socket.emit("all_notifications_marked_read", {
        userId: this.socket.userId,
        timestamp: new Date(),
      });

      logWebSocketEvent("all_notifications_marked_read", { userId: this.socket.userId }, this.socket.id);
    } catch (error: any) {
      moduleLogger.error("Failed to mark all notifications as read:", error);
      this.socket.emit("error", {
        type: "mark_all_notifications_read_failed",
        message: "Failed to mark all notifications as read",
      });
    }
  }

  private async handleGetNotificationCount(): Promise<void> {
    try {
      // TODO: Get unread notification count from database
      const unreadCount = 0; // Placeholder

      this.socket.emit("notification_count", {
        unreadCount,
        timestamp: new Date(),
      });
    } catch (error: any) {
      moduleLogger.error("Failed to get notification count:", error);
      this.socket.emit("error", {
        type: "get_notification_count_failed",
        message: "Failed to get notification count",
      });
    }
  }

  // Domain event handlers
  private handleNotificationCreated(event: any): void {
    const { userId, type, title, message, data, channels } = event.data;

    // Only send in-app notifications via WebSocket
    if (channels.includes("in_app")) {
      // Send to specific user
      this.socket.to(`user:${userId}`).emit("new_notification", {
        id: event.aggregateId,
        type,
        title,
        message,
        data,
        timestamp: event.timestamp,
        isRead: false,
      });

      logWebSocketEvent("notification_sent", { notificationId: event.aggregateId, userId, type }, this.socket.id);
    }
  }

  // Send system-wide notifications
  public sendSystemNotification(tenantId: string, notification: any): void {
    this.socket.to(`tenant:${tenantId}`).emit("system_notification", {
      ...notification,
      timestamp: new Date(),
    });

    logWebSocketEvent("system_notification_sent", { tenantId, type: notification.type }, this.socket.id);
  }

  // Send role-specific notifications
  public sendRoleNotification(tenantId: string, role: string, notification: any): void {
    this.socket.to(`tenant:${tenantId}:role:${role}`).emit("role_notification", {
      ...notification,
      timestamp: new Date(),
    });

    logWebSocketEvent("role_notification_sent", { tenantId, role, type: notification.type }, this.socket.id);
  }
}
