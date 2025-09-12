import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { config } from "@/shared/config/environment";
import { redis } from "@/shared/config/redis";
import { createModuleLogger, logWebSocketEvent } from "@/shared/config/logger";
import { JwtPayload } from "@/shared/types/auth.types";

const moduleLogger = createModuleLogger("WebSocketManager");

interface AuthenticatedSocket extends Socket {
  userId: string;
  tenantId: string;
  role: string;
  sessionId: string;
}

export class WebSocketManager {
  private io: SocketIOServer;
  private static instance: WebSocketManager;

  private constructor(httpServer: HttpServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: config.websocket.corsOrigins,
        credentials: true,
      },
      transports: ["websocket", "polling"],
    });

    this.setupMiddleware();
    this.setupEventHandlers();

    moduleLogger.info("WebSocket server initialized");
  }

  public static getInstance(httpServer?: HttpServer): WebSocketManager {
    if (!WebSocketManager.instance) {
      if (!httpServer) {
        throw new Error("HttpServer is required for first-time initialization");
      }
      WebSocketManager.instance = new WebSocketManager(httpServer);
    }
    return WebSocketManager.instance;
  }

  private setupMiddleware(): void {
    // Authentication middleware
    this.io.use(async (socket: Socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(" ")[1];

        if (!token) {
          throw new Error("Authentication token required");
        }

        // Verify JWT token
        const payload = jwt.verify(token, config.jwt.accessSecret) as JwtPayload;

        // Check if token is blacklisted
        const isBlacklisted = await redis.exists(`blacklist:${token}`);
        if (isBlacklisted) {
          throw new Error("Token has been revoked");
        }

        // Verify session is still active
        const session = await redis.getSession(payload.sessionId);
        if (!session || !session.isActive) {
          throw new Error("Session expired or invalid");
        }

        // Attach user info to socket
        const authSocket = socket as AuthenticatedSocket;
        authSocket.userId = payload.id;
        authSocket.tenantId = payload.tenantId;
        authSocket.role = payload.role;
        authSocket.sessionId = payload.sessionId;

        next();
      } catch (error: any) {
        moduleLogger.warn("WebSocket authentication failed:", error);
        next(new Error("Authentication failed"));
      }
    });

    // Tenant isolation middleware
    this.io.use((socket: Socket, next) => {
      const authSocket = socket as AuthenticatedSocket;

      // Join tenant-specific room
      socket.join(`tenant:${authSocket.tenantId}`);

      // Join user-specific room
      socket.join(`user:${authSocket.userId}`);

      // Join role-specific room within tenant
      socket.join(`tenant:${authSocket.tenantId}:role:${authSocket.role}`);

      moduleLogger.debug(
        {
          socketId: socket.id,
          userId: authSocket.userId,
          tenantId: authSocket.tenantId,
          role: authSocket.role,
        },
        "Socket authenticated and joined rooms"
      );

      next();
    });
  }

  private setupEventHandlers(): void {
    this.io.on("connection", (socket: Socket) => {
      const authSocket = socket as AuthenticatedSocket;

      logWebSocketEvent(
        "user_connected",
        {
          userId: authSocket.userId,
          tenantId: authSocket.tenantId,
          role: authSocket.role,
        },
        socket.id
      );

      // Handle disconnection
      socket.on("disconnect", (reason) => {
        logWebSocketEvent(
          "user_disconnected",
          {
            userId: authSocket.userId,
            tenantId: authSocket.tenantId,
            reason,
          },
          socket.id
        );
      });

      // Handle ping/pong for connection health
      socket.on("ping", () => {
        socket.emit("pong", { timestamp: Date.now() });
      });

      // Handle joining specific appointment rooms
      socket.on("join_appointment", (appointmentId: string) => {
        socket.join(`appointment:${appointmentId}`);
        logWebSocketEvent("joined_appointment_room", { appointmentId }, socket.id);
      });

      socket.on("leave_appointment", (appointmentId: string) => {
        socket.leave(`appointment:${appointmentId}`);
        logWebSocketEvent("left_appointment_room", { appointmentId }, socket.id);
      });

      // Handle real-time appointment updates
      socket.on("appointment_update", (data) => {
        this.handleAppointmentUpdate(authSocket, data);
      });

      // Handle typing indicators for chat (future feature)
      socket.on("typing_start", (data) => {
        socket.to(`appointment:${data.appointmentId}`).emit("user_typing", {
          userId: authSocket.userId,
          userName: data.userName,
        });
      });

      socket.on("typing_stop", (data) => {
        socket.to(`appointment:${data.appointmentId}`).emit("user_stopped_typing", {
          userId: authSocket.userId,
        });
      });

      // Handle errors
      socket.on("error", (error: any) => {
        moduleLogger.error("Socket error:", error);
      });
    });
  }

  private handleAppointmentUpdate(socket: AuthenticatedSocket, data: any): void {
    // Validate that user has permission to update this appointment
    // This would typically involve checking the database
    logWebSocketEvent("appointment_update_received", data, socket.id);

    // Broadcast to appointment participants
    if (data.appointmentId) {
      this.io.to(`appointment:${data.appointmentId}`).emit("appointment_updated", {
        ...data,
        updatedBy: socket.userId,
        timestamp: new Date(),
      });
    }
  }

  // Public methods for emitting events

  // Emit to all users in a tenant
  public emitToTenant(tenantId: string, event: string, data: any): void {
    this.io.to(`tenant:${tenantId}`).emit(event, {
      ...data,
      timestamp: new Date(),
    });

    logWebSocketEvent(`tenant_broadcast:${event}`, { tenantId, ...data });
  }

  // Emit to a specific user
  public emitToUser(userId: string, event: string, data: any): void {
    this.io.to(`user:${userId}`).emit(event, {
      ...data,
      timestamp: new Date(),
    });

    logWebSocketEvent(`user_message:${event}`, { userId, ...data });
  }

  // Emit to users with specific role in a tenant
  public emitToRole(tenantId: string, role: string, event: string, data: any): void {
    this.io.to(`tenant:${tenantId}:role:${role}`).emit(event, {
      ...data,
      timestamp: new Date(),
    });

    logWebSocketEvent(`role_broadcast:${event}`, { tenantId, role, ...data });
  }

  // Emit to all participants of an appointment
  public emitToAppointment(appointmentId: string, event: string, data: any): void {
    this.io.to(`appointment:${appointmentId}`).emit(event, {
      ...data,
      timestamp: new Date(),
    });

    logWebSocketEvent(`appointment_broadcast:${event}`, { appointmentId, ...data });
  }

  // Appointment-specific events
  public notifyAppointmentCreated(appointment: any): void {
    // Notify doctor
    this.emitToUser(appointment.doctorId, "appointment_created", {
      type: "appointment_created",
      appointment,
      message: "New appointment scheduled",
    });

    // Notify patient
    this.emitToUser(appointment.patientId, "appointment_created", {
      type: "appointment_created",
      appointment,
      message: "Your appointment has been scheduled",
    });
  }

  public notifyAppointmentUpdated(appointment: any, updatedBy: string): void {
    const event = "appointment_updated";
    const data = {
      type: "appointment_updated",
      appointment,
      updatedBy,
      message: "Appointment has been updated",
    };

    // Notify both doctor and patient
    this.emitToUser(appointment.doctorId, event, data);
    this.emitToUser(appointment.patientId, event, data);

    // Notify appointment room
    this.emitToAppointment(appointment.id, event, data);
  }

  public notifyAppointmentCancelled(appointment: any, cancelledBy: string, reason?: string): void {
    const event = "appointment_cancelled";
    const data = {
      type: "appointment_cancelled",
      appointment,
      cancelledBy,
      reason,
      message: "Appointment has been cancelled",
    };

    // Notify both parties
    this.emitToUser(appointment.doctorId, event, data);
    this.emitToUser(appointment.patientId, event, data);

    // Notify appointment room
    this.emitToAppointment(appointment.id, event, data);
  }

  public notifyAppointmentReminder(appointment: any, minutesUntil: number): void {
    const event = "appointment_reminder";
    const data = {
      type: "appointment_reminder",
      appointment,
      minutesUntil,
      message: `Appointment reminder: ${minutesUntil} minutes until your appointment`,
    };

    // Notify both parties
    this.emitToUser(appointment.doctorId, event, data);
    this.emitToUser(appointment.patientId, event, data);
  }

  // Doctor availability events
  public notifyAvailabilityUpdated(tenantId: string, doctorId: string, availability: any): void {
    const event = "availability_updated";
    const data = {
      type: "availability_updated",
      doctorId,
      availability,
      message: "Doctor availability has been updated",
    };

    // Notify all patients in the tenant
    this.emitToRole(tenantId, "patient", event, data);

    // Notify the specific doctor
    this.emitToUser(doctorId, event, data);
  }

  // System-wide notifications
  public notifySystemMaintenance(tenantId: string, maintenanceInfo: any): void {
    this.emitToTenant(tenantId, "system_maintenance", {
      type: "system_maintenance",
      ...maintenanceInfo,
      message: "System maintenance scheduled",
    });
  }

  // Get connection statistics
  public getConnectionStats(): any {
    const sockets = this.io.sockets.sockets;
    const connections = Array.from(sockets.values()).map((socket) => {
      const authSocket = socket as AuthenticatedSocket;
      return {
        socketId: socket.id,
        userId: authSocket.userId,
        tenantId: authSocket.tenantId,
        role: authSocket.role,
        connected: socket.connected,
        rooms: Array.from(socket.rooms),
      };
    });

    return {
      totalConnections: sockets.size,
      connections,
      timestamp: new Date(),
    };
  }

  // Close all connections (for graceful shutdown)
  public async close(): Promise<void> {
    return new Promise((resolve) => {
      this.io.close(() => {
        moduleLogger.info("WebSocket server closed");
        resolve();
      });
    });
  }
}
