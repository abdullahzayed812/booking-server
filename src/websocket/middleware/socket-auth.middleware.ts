import { Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { config } from "@/shared/config/environment";
import { redis } from "@/shared/config/redis";
import { createModuleLogger } from "@/shared/config/logger";
import { JwtPayload } from "@/shared/types/auth.types";

const moduleLogger = createModuleLogger("SocketAuthMiddleware");

interface AuthenticatedSocket extends Socket {
  userId: string;
  tenantId: string;
  role: string;
  sessionId: string;
}

export const socketAuthMiddleware = async (socket: Socket, next: Function) => {
  try {
    // Extract token from handshake
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(" ")[1];

    if (!token) {
      moduleLogger.warn("WebSocket connection attempted without token", {
        socketId: socket.id,
        ip: socket.handshake.address,
      });
      return next(new Error("Authentication token required"));
    }

    // Verify JWT token
    const payload = jwt.verify(token, config.jwt.accessSecret) as JwtPayload;

    // Check if token is blacklisted
    const isBlacklisted = await redis.exists(`blacklist:${token}`);
    if (isBlacklisted) {
      moduleLogger.warn("WebSocket connection attempted with blacklisted token", {
        socketId: socket.id,
        userId: payload.id,
      });
      return next(new Error("Token has been revoked"));
    }

    // Verify session is still active
    const session = await redis.getSession(payload.sessionId);
    if (!session || !session.isActive) {
      moduleLogger.warn("WebSocket connection attempted with inactive session", {
        socketId: socket.id,
        userId: payload.id,
        sessionId: payload.sessionId,
      });
      return next(new Error("Session expired or invalid"));
    }

    // Attach user info to socket
    const authSocket = socket as AuthenticatedSocket;
    authSocket.userId = payload.id;
    authSocket.tenantId = payload.tenantId;
    authSocket.role = payload.role;
    authSocket.sessionId = payload.sessionId;

    moduleLogger.debug("WebSocket authenticated successfully", {
      socketId: socket.id,
      userId: payload.id,
      tenantId: payload.tenantId,
      role: payload.role,
    });

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      moduleLogger.warn("WebSocket authentication failed - Invalid token", {
        socketId: socket.id,
        error: error.message,
      });
      return next(new Error("Invalid token"));
    }

    if (error instanceof jwt.TokenExpiredError) {
      moduleLogger.warn("WebSocket authentication failed - Token expired", {
        socketId: socket.id,
      });
      return next(new Error("Token expired"));
    }

    moduleLogger.error("WebSocket authentication error:", {
      socketId: socket.id,
      error,
    });
    next(new Error("Authentication failed"));
  }
};

export const socketTenantMiddleware = (socket: Socket, next: Function) => {
  const authSocket = socket as AuthenticatedSocket;

  try {
    // Join tenant-specific room
    socket.join(`tenant:${authSocket.tenantId}`);

    // Join user-specific room
    socket.join(`user:${authSocket.userId}`);

    // Join role-specific room within tenant
    socket.join(`tenant:${authSocket.tenantId}:role:${authSocket.role}`);

    moduleLogger.debug("Socket joined tenant rooms", {
      socketId: socket.id,
      userId: authSocket.userId,
      tenantId: authSocket.tenantId,
      role: authSocket.role,
      rooms: Array.from(socket.rooms),
    });

    next();
  } catch (error) {
    moduleLogger.error("Socket tenant middleware error:", error);
    next(new Error("Failed to join tenant rooms"));
  }
};
