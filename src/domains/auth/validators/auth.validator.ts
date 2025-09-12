import { z } from "zod";
import { UserRole } from "@/shared/types/common.types";

// Password validation schema
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters long")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[!@#$%^&*(),.?":{}|<>]/, "Password must contain at least one special character");

// Email validation schema
const emailSchema = z.string().email("Invalid email format").min(1, "Email is required").max(255, "Email is too long");

// Name validation schema
const nameSchema = z.string().min(1, "Name is required").max(100, "Name is too long").trim();

// Phone validation schema
const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format")
  .optional();

// Register validation schema
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  phone: phoneSchema,
  dateOfBirth: z
    .string()
    .datetime()
    .optional()
    .or(
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
        .optional()
    ),
  role: z.enum([UserRole.ADMIN, UserRole.DOCTOR, UserRole.PATIENT]),
  tenantId: z.string().uuid().optional(), // For admin creating users
});

// Login validation schema
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
  tenantId: z.string().uuid().optional(),
});

// Change password validation schema
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordSchema,
});

// Refresh token validation schema
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

// Reset password request validation schema
export const resetPasswordRequestSchema = z.object({
  email: emailSchema,
  tenantId: z.string().uuid().optional(),
});

// Reset password confirm validation schema
export const resetPasswordConfirmSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  newPassword: passwordSchema,
});

// Verify email validation schema
export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Verification token is required"),
});

// Update profile validation schema
export const updateProfileSchema = z.object({
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  phone: phoneSchema,
  dateOfBirth: z
    .string()
    .datetime()
    .optional()
    .or(
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
        .optional()
    ),
});

// Session management validation schemas
export const revokeSessionSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID"),
});

// Validation middleware factory
export const validateRequest = (schema: z.ZodSchema) => {
  return (req: any, res: any, next: any) => {
    try {
      const validated = schema.parse(req.body);
      req.validatedBody = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationErrors = error.errors.map((err) => ({
          field: err.path.join("."),
          message: err.message,
          code: err.code,
        }));

        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: validationErrors,
        });
      }
      next(error);
    }
  };
};

// Validation middleware factory for query parameters
export const validateQuery = (schema: z.ZodSchema) => {
  return (req: any, res: any, next: any) => {
    try {
      const validated = schema.parse(req.query);
      req.validatedQuery = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationErrors = error.errors.map((err) => ({
          field: err.path.join("."),
          message: err.message,
          code: err.code,
        }));

        return res.status(400).json({
          success: false,
          message: "Query validation failed",
          errors: validationErrors,
        });
      }
      next(error);
    }
  };
};

// Validation middleware factory for URL parameters
export const validateParams = (schema: z.ZodSchema) => {
  return (req: any, res: any, next: any) => {
    try {
      const validated = schema.parse(req.params);
      req.validatedParams = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationErrors = error.errors.map((err) => ({
          field: err.path.join("."),
          message: err.message,
          code: err.code,
        }));

        return res.status(400).json({
          success: false,
          message: "Parameter validation failed",
          errors: validationErrors,
        });
      }
      next(error);
    }
  };
};

// Common parameter schemas
export const idParamSchema = z.object({
  id: z.string().uuid("Invalid ID format"),
});

export const sessionIdParamSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID format"),
});

// Extend Express Request interface to include validated data
declare global {
  namespace Express {
    interface Request {
      validatedBody?: any;
      validatedQuery?: any;
      validatedParams?: any;
    }
  }
}

// Custom validation functions
export const validatePassword = (password: string): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("Password must be at least 8 characters long");
  }

  if (password.length > 128) {
    errors.push("Password must not exceed 128 characters");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push("Password must contain at least one special character");
  }

  // Check for common weak passwords
  const commonPasswords = ["password", "12345678", "qwerty", "abc123", "password123", "123456789", "welcome", "admin"];

  if (commonPasswords.includes(password.toLowerCase())) {
    errors.push("Password is too common and easily guessable");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

export const validateEmail = (email: string): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!email) {
    errors.push("Email is required");
    return { isValid: false, errors };
  }

  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    errors.push("Invalid email format");
  }

  // Length validation
  if (email.length > 255) {
    errors.push("Email address is too long");
  }

  // Domain validation (basic)
  const domain = email.split("@")[1];
  if (domain && domain.length > 255) {
    errors.push("Email domain is too long");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Rate limiting validation helper
export const createRateLimitKey = (identifier: string, action: string): string => {
  return `rate_limit:${action}:${identifier}`;
};

// Sanitization helpers
export const sanitizeInput = (input: string): string => {
  return input.trim().replace(/[<>]/g, "");
};

export const sanitizeEmail = (email: string): string => {
  return email.toLowerCase().trim();
};
