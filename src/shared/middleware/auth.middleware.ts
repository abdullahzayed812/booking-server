import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/environment";
import { redis } from "../config/redis";
import { db } from "../config/database";
import { logger } from "../config/logger";
import { AppError, UnauthorizedError, ForbiddenError, CACHE_KEYS, UserRole } from "../types/common.types";
import { JwtPayload, AuthUser, Resource, Action, PermissionContext } from "../types/auth.types";
import { UserEntity } from "@/domains/auth/models/user.model";

export const authenticateToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

    if (!token) {
      throw new UnauthorizedError("Access token required");
    }

    // Verify JWT token
    const payload = jwt.verify(token, config.jwt.accessSecret) as JwtPayload;

    // Check if token is blacklisted
    const isBlacklisted = await redis.exists(`blacklist:${token}`);
    if (isBlacklisted) {
      throw new UnauthorizedError("Token has been revoked");
    }

    // Verify session is still active
    const session = await redis.getSession(payload.sessionId);
    if (!session || !session.isActive) {
      throw new UnauthorizedError("Session expired or invalid");
    }

    // Get user from cache or database
    let user = await redis.get<AuthUser>(CACHE_KEYS.USER(payload.id), req.tenantId);

    if (!user) {
      const dbUser = await db.queryOne(
        "SELECT * FROM users WHERE id = ? AND tenant_id = ? AND is_active = true",
        [payload.id, payload.tenantId],
        req.tenantId
      );

      if (!dbUser) {
        throw new UnauthorizedError("User not found or inactive");
      }

      const userEntity = UserEntity.fromDatabase(dbUser);

      user = userEntity.toAuthUser();

      // Cache user for 15 minutes
      await redis.set(CACHE_KEYS.USER(user.id), user, 900, req.tenantId);
    }

    // Verify tenant matches
    if (req.tenantId && user.tenantId !== req.tenantId) {
      throw new ForbiddenError("User does not belong to this tenant");
    }

    // Set user context
    req.user = user;
    req.sessionId = payload.sessionId;

    // Update last activity
    await redis.hSet(`session:${payload.sessionId}`, "lastActivityAt", new Date(), user.tenantId);

    logger.debug(
      {
        userId: user.id,
        tenantId: user.tenantId,
        role: user.role,
        sessionId: payload.sessionId,
      },
      "User authenticated"
    );

    next();
  } catch (error: any) {
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new UnauthorizedError("Invalid token"));
    }

    if (error instanceof jwt.TokenExpiredError) {
      return next(new UnauthorizedError("Token expired"));
    }

    if (error instanceof AppError) {
      return next(error);
    }

    logger.error("Authentication error:", error);
    return next(new UnauthorizedError("Authentication failed"));
  }
};

// Optional authentication - doesn't fail if no token
export const optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return next();
    }

    // Use the same logic as authenticateToken but don't throw errors
    await authenticateToken(req, res, next);
  } catch (error) {
    // Ignore authentication errors for optional auth
    next();
  }
};

// Role-based access control
export const requireRole = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError("Authentication required");
    }

    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError("Insufficient permissions");
    }

    next();
  };
};

// Permission-based access control
export const requirePermission = (resource: Resource, action: Action) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError("Authentication required");
      }

      const context: PermissionContext = {
        userId: req.user.id,
        tenantId: req.user.tenantId,
        role: req.user.role,
        resource,
        action,
        resourceId: req.params["id"],
      };

      const hasPermission = await checkPermission(context);

      if (!hasPermission) {
        throw new ForbiddenError("Permission denied");
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

// Check if user has specific permission
async function checkPermission(context: PermissionContext): Promise<boolean> {
  const { role, resource, action, userId, resourceId } = context;

  // Admin has all permissions
  if (role === UserRole.ADMIN) {
    return true;
  }

  // Resource-specific permission logic
  switch (resource) {
    case Resource.APPOINTMENT:
      return checkAppointmentPermission(context);

    case Resource.MEDICAL_NOTE:
      return checkMedicalNotePermission(context);

    case Resource.DOCTOR:
      return checkDoctorPermission(context);

    case Resource.PATIENT:
      return checkPatientPermission(context);

    case Resource.AVAILABILITY:
      return checkAvailabilityPermission(context);

    case Resource.ANALYTICS:
      return role === (UserRole.ADMIN as string); // Only admins can access analytics

    default:
      return false;
  }
}

async function checkAppointmentPermission(context: PermissionContext): Promise<boolean> {
  const { role, action, userId, resourceId } = context;

  switch (action) {
    case Action.CREATE:
      // Patients and doctors can create appointments
      return [UserRole.PATIENT, UserRole.DOCTOR].includes(role);

    case Action.READ:
      if (!resourceId) return true; // List permissions

      // Users can only read their own appointments
      const appointment = await db.queryOne(
        "SELECT patient_id, doctor_id FROM appointments WHERE id = ?",
        [resourceId],
        context.tenantId
      );

      if (!appointment) return false;

      return appointment.patient_id === userId || appointment.doctor_id === userId;

    case Action.UPDATE:
    case Action.DELETE:
      if (!resourceId) return false;

      // Only appointment participants can modify
      const appointmentToModify = await db.queryOne(
        "SELECT patient_id, doctor_id FROM appointments WHERE id = ?",
        [resourceId],
        context.tenantId
      );

      if (!appointmentToModify) return false;

      return appointmentToModify.patient_id === userId || appointmentToModify.doctor_id === userId;

    default:
      return false;
  }
}

async function checkMedicalNotePermission(context: PermissionContext): Promise<boolean> {
  const { role, action, userId, resourceId } = context;

  switch (action) {
    case Action.CREATE:
    case Action.UPDATE:
      // Only doctors can create/update medical notes
      return role === UserRole.DOCTOR;

    case Action.READ:
      if (!resourceId) {
        // Doctors can list their notes, patients can list their own
        return [UserRole.DOCTOR, UserRole.PATIENT].includes(role);
      }

      // Check if user has access to this specific note
      const note = await db.queryOne(
        `SELECT mn.doctor_id, a.patient_id 
         FROM medical_notes mn 
         JOIN appointments a ON mn.appointment_id = a.id 
         WHERE mn.id = ?`,
        [resourceId],
        context.tenantId
      );

      if (!note) return false;

      return note.doctor_id === userId || note.patient_id === userId;

    case Action.DELETE:
      // Only the creating doctor can delete
      if (!resourceId) return false;

      const noteToDelete = await db.queryOne(
        "SELECT doctor_id FROM medical_notes WHERE id = ?",
        [resourceId],
        context.tenantId
      );

      return noteToDelete?.doctor_id === userId;

    default:
      return false;
  }
}

async function checkDoctorPermission(context: PermissionContext): Promise<boolean> {
  const { role, action, userId, resourceId } = context;

  switch (action) {
    case Action.READ:
      return true; // All authenticated users can read doctor info

    case Action.UPDATE:
      // Doctors can update their own profile
      if (role === UserRole.DOCTOR && resourceId === userId) {
        return true;
      }
      return false;

    case Action.CREATE:
    case Action.DELETE:
      // Only admins can create/delete doctor accounts
      return false; // This should be handled by admin endpoints

    default:
      return false;
  }
}

async function checkPatientPermission(context: PermissionContext): Promise<boolean> {
  const { role, action, userId, resourceId } = context;

  switch (action) {
    case Action.READ:
      if (role === UserRole.DOCTOR) return true; // Doctors can read patient info
      if (role === UserRole.PATIENT && resourceId === userId) return true; // Self-read
      return false;

    case Action.UPDATE:
      // Patients can update their own profile
      return role === UserRole.PATIENT && resourceId === userId;

    default:
      return false;
  }
}

async function checkAvailabilityPermission(context: PermissionContext): Promise<boolean> {
  const { role, action, userId } = context;

  switch (action) {
    case Action.READ:
      return true; // Anyone can read availability

    case Action.CREATE:
    case Action.UPDATE:
    case Action.DELETE:
      // Only doctors can manage their own availability
      return role === UserRole.DOCTOR;

    default:
      return false;
  }
}

// Middleware to ensure user belongs to current tenant
export const requireTenantMembership = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user || !req.tenantId) {
    throw new UnauthorizedError("Authentication and tenant context required");
  }

  if (req.user.tenantId !== req.tenantId) {
    throw new ForbiddenError("User does not belong to this tenant");
  }

  next();
};
