import { UserRole } from "./common.types";

// JWT payload interface
export interface JwtPayload {
  id: string;
  email: string;
  role: UserRole;
  tenantId: string;
  sessionId: string;
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload {
  id: string;
  sessionId: string;
  tokenVersion: number;
  iat: number;
  exp: number;
}

// Authentication request/response types
export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  phone?: string;
  dateOfBirth?: string;
  tenantId?: string; // For admin creating users
}

export interface LoginRequest {
  email: string;
  password: string;
  tenantId?: string; // Optional for multi-tenant login
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  tenantId: string;
  isActive: boolean;
  isVerified: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ResetPasswordRequest {
  email: string;
  tenantId?: string;
}

export interface ResetPasswordConfirmRequest {
  token: string;
  newPassword: string;
}

export interface VerifyEmailRequest {
  token: string;
}

// User session information
export interface UserSession {
  id: string;
  userId: string;
  tenantId: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  lastActivityAt: Date;
  ipAddress?: string;
  userAgent?: string;
  tokenVersion: number;
}

// Permission-based access control
export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  description?: string;
}

export interface RolePermission {
  role: UserRole;
  permissions: Permission[];
}

// Resources for RBAC
export enum Resource {
  USER = "user",
  APPOINTMENT = "appointment",
  DOCTOR = "doctor",
  PATIENT = "patient",
  MEDICAL_NOTE = "medical_note",
  AVAILABILITY = "availability",
  NOTIFICATION = "notification",
  ANALYTICS = "analytics",
  TENANT = "tenant",
}

// Actions for RBAC
export enum Action {
  CREATE = "create",
  READ = "read",
  UPDATE = "update",
  DELETE = "delete",
  MANAGE = "manage", // All actions
}

// Permission check context
export interface PermissionContext {
  userId: string;
  tenantId: string;
  role: UserRole;
  resource: Resource;
  action: Action;
  resourceId?: string;
}

// Auth middleware extended request
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      tenantId?: string;
      sessionId?: string;
      correlationId?: string;
    }
  }
}

// Password validation rules
export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSymbols: boolean;
  maxLength?: number;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSymbols: true,
  maxLength: 128,
};

// Token blacklist for logout
export interface TokenBlacklist {
  token: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

// OAuth integration (future)
export interface OAuthProvider {
  name: string;
  clientId: string;
  clientSecret: string;
  redirectUrl: string;
  scope: string[];
}

export interface OAuthProfile {
  provider: string;
  providerId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
}

// Multi-factor authentication (future)
export interface MfaSettings {
  enabled: boolean;
  methods: MfaMethod[];
  backupCodes: string[];
}

export enum MfaMethod {
  TOTP = "totp",
  SMS = "sms",
  EMAIL = "email",
}

// Security events for audit log
export enum SecurityEvent {
  LOGIN_SUCCESS = "login_success",
  LOGIN_FAILED = "login_failed",
  LOGOUT = "logout",
  PASSWORD_CHANGED = "password_changed",
  PASSWORD_RESET_REQUESTED = "password_reset_requested",
  PASSWORD_RESET_COMPLETED = "password_reset_completed",
  EMAIL_VERIFIED = "email_verified",
  ACCOUNT_LOCKED = "account_locked",
  ACCOUNT_UNLOCKED = "account_unlocked",
  PERMISSION_DENIED = "permission_denied",
  TOKEN_REFRESH = "token_refresh",
  SESSION_EXPIRED = "session_expired",
}

export interface SecurityAuditLog {
  id: string;
  userId: string;
  tenantId: string;
  event: SecurityEvent;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}
