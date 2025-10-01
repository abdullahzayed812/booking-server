// Base entity interface
export interface BaseEntity {
  id: string;
  tenant_id: string;
  created_at: Date;
  updated_at: Date;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string | undefined;
  errors?: IValidationError[] | undefined;
  meta?: PaginationMeta | undefined;
}

export interface IValidationError {
  field: string;
  message: string;
  code?: string;
  debug?: Record<string, string | undefined>;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

// Database query types
export interface QueryOptions {
  tenantId?: string;
  userId?: string;
  include?: string[];
  exclude?: string[];
}

export interface WhereClause {
  field: string;
  operator: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "like" | "in" | "between";
  value: any;
}

export interface QueryBuilder {
  select?: string[];
  where?: WhereClause[];
  joins?: JoinClause[];
  orderBy?: OrderByClause[];
  limit?: number;
  offset?: number;
}

export interface JoinClause {
  table: string;
  type: "INNER" | "LEFT" | "RIGHT" | "FULL";
  on: string;
}

export interface OrderByClause {
  field: string;
  direction: "ASC" | "DESC";
}

// Event types for domain events
export interface DomainEvent {
  id: string;
  type: string;
  tenantId: string;
  aggregateId: string;
  aggregateType: string;
  data: any;
  version: number;
  timestamp: Date;
  userId?: string;
  correlationId?: string;
}

// WebSocket event types
export interface WebSocketEvent {
  type: string;
  data: any;
  tenantId?: string;
  userId?: string;
  timestamp: Date;
}

// User roles enum
export enum UserRole {
  ADMIN = "admin",
  DOCTOR = "doctor",
  PATIENT = "patient",
}

// Appointment status enum
export enum AppointmentStatus {
  SCHEDULED = "scheduled",
  CONFIRMED = "confirmed",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
  NO_SHOW = "no_show",
}

// Notification types enum
export enum NotificationType {
  EMAIL = "email",
  SMS = "sms",
  PUSH = "push",
  IN_APP = "in_app",
}

// Time slot types
export interface TimeSlot {
  start: string; // HH:mm format
  end: string; // HH:mm format
}

export interface DateTimeSlot {
  start: Date;
  end: Date;
}

// Availability types
export enum DayOfWeek {
  MONDAY = 1,
  TUESDAY = 2,
  WEDNESDAY = 3,
  THURSDAY = 4,
  FRIDAY = 5,
  SATURDAY = 6,
  SUNDAY = 0,
}

export interface WeeklySchedule {
  [DayOfWeek.MONDAY]?: TimeSlot[];
  [DayOfWeek.TUESDAY]?: TimeSlot[];
  [DayOfWeek.WEDNESDAY]?: TimeSlot[];
  [DayOfWeek.THURSDAY]?: TimeSlot[];
  [DayOfWeek.FRIDAY]?: TimeSlot[];
  [DayOfWeek.SATURDAY]?: TimeSlot[];
  [DayOfWeek.SUNDAY]?: TimeSlot[];
}

// Request context
export interface RequestContext {
  tenantId: string;
  userId: string;
  userRole: UserRole;
  sessionId?: string;
  correlationId: string;
  ip?: string;
  userAgent?: string;
}

// Cache key patterns
export const CACHE_KEYS = {
  USER: (id: string) => `user:${id}`,
  DOCTOR: (id: string) => `doctor:${id}`,
  PATIENT: (id: string) => `patient:${id}`,
  APPOINTMENT: (id: string) => `appointment:${id}`,
  AVAILABILITY: (doctorId: string, date: string) => `availability:${doctorId}:${date}`,
  DOCTOR_SCHEDULE: (doctorId: string) => `schedule:${doctorId}`,
  TENANT: (id: string) => `tenant:${id}`,
  SESSION: (id: string) => `session:${id}`,
  REFRESH_TOKEN: (token: string) => `refresh_token:${token}`,
} as const;

// Error types
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = "INTERNAL_ERROR",
    isOperational: boolean = true
  ) {
    super(message);

    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, field?: string) {
    super(message, 400, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden") {
    super(message, 403, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = "Resource not found") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string = "Resource conflict") {
    super(message, 409, "CONFLICT");
    this.name = "ConflictError";
  }
}

// Utility types
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type Partial<T> = {
  [P in keyof T]?: T[P];
};

export type Pick<T, K extends keyof T> = {
  [P in K]: T[P];
};

export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

// Database transaction type
export interface DatabaseTransaction {
  commit(): Promise<void>;
  rollback(): Promise<void>;
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>;
}

// Availability errors
export class AvailabilityConflictError extends Error {
  constructor(message: string, public conflicts: string[]) {
    super(message);
    this.name = "AvailabilityConflictError";
  }
}

export class InvalidTimeSlotError extends Error {
  constructor(message: string, public invalidSlot: string) {
    super(message);
    this.name = "InvalidTimeSlotError";
  }
}

export class ScheduleValidationError extends Error {
  constructor(message: string, public validationErrors: string[]) {
    super(message);
    this.name = "ScheduleValidationError";
  }
}
