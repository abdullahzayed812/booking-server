import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { config } from "@/shared/config/environment";
import { redis } from "@/shared/config/redis";
import { db } from "@/shared/config/database";
import { createModuleLogger } from "@/shared/config/logger";
import { UnauthorizedError, ValidationError } from "@/shared/types/common.types";
import {
  RegisterRequest,
  LoginRequest,
  AuthResponse,
  AuthUser,
  JwtPayload,
  RefreshTokenPayload,
  UserSession,
  ChangePasswordRequest,
  SecurityEvent,
} from "@/shared/types/auth.types";
import { UserRepository } from "../repositories/user.repository";
import { UserEntity, CreateUserData } from "../models/user.model";

const moduleLogger = createModuleLogger("AuthService");

export class AuthService {
  constructor(private userRepository: UserRepository) {}

  async register(registerData: RegisterRequest, tenantId: string): Promise<AuthResponse> {
    try {
      // Validate password strength
      this.validatePassword(registerData.password);

      // Hash password
      const passwordHash = await this.hashPassword(registerData.password);

      // Create user data
      const createUserData: CreateUserData = {
        tenantId,
        email: registerData.email.toLowerCase().trim(),
        passwordHash,
        firstName: registerData.firstName.trim(),
        lastName: registerData.lastName.trim(),
        phone: registerData.phone?.trim(),
        dateOfBirth: registerData.dateOfBirth ? new Date(registerData.dateOfBirth) : undefined,
        role: registerData.role,
      };

      // Create user
      const user = await this.userRepository.create(createUserData);

      // Create session and tokens
      const sessionId = uuidv4();
      const session = await this.createUserSession(user, sessionId);
      const tokens = await this.generateTokens(user, sessionId);

      // Log security event
      await this.logSecurityEvent(SecurityEvent.LOGIN_SUCCESS, user.id, tenantId);

      const authResponse: AuthResponse = {
        user: this.mapToAuthUser(user),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: this.getTokenExpiresIn(config.jwt.accessExpiresIn),
      };

      moduleLogger.info(
        {
          userId: user.id,
          tenantId,
          email: registerData.email,
          role: registerData.role,
        },
        "User registered successfully"
      );

      return authResponse;
    } catch (error: any) {
      moduleLogger.error("Registration error:", error);
      throw error;
    }
  }

  async login(loginData: LoginRequest, tenantId: string, metadata?: any): Promise<AuthResponse> {
    try {
      // Find user by email
      const user = await this.userRepository.findByEmail(loginData.email.toLowerCase().trim(), tenantId);

      if (!user) {
        await this.logSecurityEvent(SecurityEvent.LOGIN_FAILED, null, tenantId, {
          email: loginData.email,
          reason: "user_not_found",
          ...metadata,
        });
        throw new UnauthorizedError("Invalid credentials");
      }

      // Check if user can login
      if (!user.canLogin()) {
        await this.logSecurityEvent(SecurityEvent.LOGIN_FAILED, user.id, tenantId, {
          reason: "account_inactive",
          ...metadata,
        });
        throw new UnauthorizedError("Account is inactive");
      }

      // Verify password
      const isValidPassword = await this.verifyPassword(loginData.password, user.getRawData().passwordHash);

      if (!isValidPassword) {
        await this.logSecurityEvent(SecurityEvent.LOGIN_FAILED, user.id, tenantId, {
          reason: "invalid_password",
          ...metadata,
        });
        throw new UnauthorizedError("Invalid credentials");
      }

      // Update last login
      user.markAsLoggedIn();
      await this.userRepository.update(
        user.id,
        {
          lastLoginAt: user.lastLoginAt,
        },
        tenantId
      );

      // Create session and tokens
      const sessionId = uuidv4();
      const session = await this.createUserSession(user, sessionId, metadata);
      const tokens = await this.generateTokens(user, sessionId);

      // Log successful login
      await this.logSecurityEvent(SecurityEvent.LOGIN_SUCCESS, user.id, tenantId, metadata);

      const authResponse: AuthResponse = {
        user: this.mapToAuthUser(user),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: this.getTokenExpiresIn(config.jwt.accessExpiresIn),
      };

      moduleLogger.info(
        {
          userId: user.id,
          tenantId,
          email: loginData.email,
          sessionId,
        },
        "User logged in successfully"
      );

      return authResponse;
    } catch (error: any) {
      moduleLogger.error("Login error:", error);
      throw error;
    }
  }

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    try {
      // Verify refresh token
      const payload = jwt.verify(refreshToken, config.jwt.refreshSecret) as RefreshTokenPayload;

      // Get session
      const session = await redis.getSession<UserSession>(payload.sessionId);
      if (!session || !session.isActive) {
        throw new UnauthorizedError("Invalid refresh token");
      }

      // Get user
      const user = await this.userRepository.findById(payload.id, session.tenantId);
      if (!user) {
        throw new UnauthorizedError("User not found");
      }

      // Verify token version
      if (payload.tokenVersion !== user.tokenVersion) {
        throw new UnauthorizedError("Token has been invalidated");
      }

      // Generate new tokens
      const tokens = await this.generateTokens(user, payload.sessionId);

      // Update session activity
      await this.updateSessionActivity(payload.sessionId);

      // Log token refresh
      await this.logSecurityEvent(SecurityEvent.TOKEN_REFRESH, user.id, user.tenantId);

      const authResponse: AuthResponse = {
        user: this.mapToAuthUser(user),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: this.getTokenExpiresIn(config.jwt.accessExpiresIn),
      };

      moduleLogger.debug(
        {
          userId: user.id,
          sessionId: payload.sessionId,
        },
        "Token refreshed successfully"
      );

      return authResponse;
    } catch (error: any) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedError("Invalid refresh token");
      }
      moduleLogger.error("Token refresh error:", error);
      throw error;
    }
  }

  async logout(userId: string, sessionId: string, accessToken: string): Promise<void> {
    try {
      // Get session
      const session = await redis.getSession<UserSession>(sessionId);
      if (session) {
        // Deactivate session
        session.isActive = false;
        await redis.setSession(sessionId, session, 0); // Expire immediately

        // Add access token to blacklist
        const tokenPayload = jwt.decode(accessToken) as JwtPayload;
        if (tokenPayload) {
          const ttl = tokenPayload.exp - Math.floor(Date.now() / 1000);
          if (ttl > 0) {
            await redis.set(`blacklist:${accessToken}`, true, ttl);
          }
        }

        // Log logout event
        await this.logSecurityEvent(SecurityEvent.LOGOUT, userId, session.tenantId);

        moduleLogger.info(
          {
            userId,
            sessionId,
            tenantId: session.tenantId,
          },
          "User logged out successfully"
        );
      }
    } catch (error: any) {
      moduleLogger.error("Logout error:", error);
      throw error;
    }
  }

  async changePassword(userId: string, passwordData: ChangePasswordRequest, tenantId: string): Promise<void> {
    try {
      // Get user
      const user = await this.userRepository.findById(userId, tenantId);
      if (!user) {
        throw new UnauthorizedError("User not found");
      }

      // Verify current password
      const isValidPassword = await this.verifyPassword(passwordData.currentPassword, user.getRawData().passwordHash);

      if (!isValidPassword) {
        throw new UnauthorizedError("Current password is incorrect");
      }

      // Validate new password
      this.validatePassword(passwordData.newPassword);

      // Hash new password
      const newPasswordHash = await this.hashPassword(passwordData.newPassword);

      // Update password
      await this.userRepository.updatePassword(userId, newPasswordHash, tenantId);

      // Invalidate all user sessions except current one (if provided)
      await this.invalidateUserSessions(userId, tenantId);

      // Log password change
      await this.logSecurityEvent(SecurityEvent.PASSWORD_CHANGED, userId, tenantId);

      moduleLogger.info(
        {
          userId,
          tenantId,
        },
        "Password changed successfully"
      );
    } catch (error: any) {
      moduleLogger.error("Change password error:", error);
      throw error;
    }
  }

  async getUserSessions(userId: string, tenantId: string): Promise<UserSession[]> {
    try {
      const sessions = await db.query<UserSession>(
        `SELECT * FROM user_sessions 
         WHERE user_id = ? AND tenant_id = ? AND is_active = true
         ORDER BY last_activity_at DESC`,
        [userId, tenantId],
        tenantId
      );

      return sessions;
    } catch (error: any) {
      moduleLogger.error("Error getting user sessions:", error);
      throw error;
    }
  }

  async revokeSession(userId: string, sessionId: string, tenantId: string): Promise<void> {
    try {
      await db.query(
        "UPDATE user_sessions SET is_active = false WHERE id = ? AND user_id = ? AND tenant_id = ?",
        [sessionId, userId, tenantId],
        tenantId
      );

      // Remove from Redis
      await redis.deleteSession(sessionId);

      moduleLogger.info(
        {
          userId,
          sessionId,
          tenantId,
        },
        "Session revoked successfully"
      );
    } catch (error: any) {
      moduleLogger.error("Error revoking session:", error);
      throw error;
    }
  }

  // Private helper methods
  private async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  private validatePassword(password: string): void {
    if (password.length < 8) {
      throw new ValidationError("Password must be at least 8 characters long");
    }

    if (!/[A-Z]/.test(password)) {
      throw new ValidationError("Password must contain at least one uppercase letter");
    }

    if (!/[a-z]/.test(password)) {
      throw new ValidationError("Password must contain at least one lowercase letter");
    }

    if (!/[0-9]/.test(password)) {
      throw new ValidationError("Password must contain at least one number");
    }

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      throw new ValidationError("Password must contain at least one special character");
    }
  }

  private async generateTokens(
    user: UserEntity,
    sessionId: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const jwtPayload: Omit<JwtPayload, "iat" | "exp"> = {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      sessionId,
    };

    const refreshPayload: Omit<RefreshTokenPayload, "iat" | "exp"> = {
      id: user.id,
      sessionId,
      tokenVersion: user.tokenVersion,
    };

    const accessToken = jwt.sign(jwtPayload, config.jwt.accessSecret, {
      expiresIn: config.jwt.accessExpiresIn,
    });

    const refreshToken = jwt.sign(refreshPayload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiresIn,
    });

    return { accessToken, refreshToken };
  }

  private async createUserSession(user: UserEntity, sessionId: string, metadata?: any): Promise<UserSession> {
    const session: UserSession = {
      id: sessionId,
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      isActive: true,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
      tokenVersion: user.tokenVersion,
    };

    // Store in Redis with TTL
    const ttl = this.getTokenExpiresIn(config.jwt.refreshExpiresIn);
    await redis.setSession(sessionId, session, ttl);

    // Store in database for persistence
    await db.query(
      `INSERT INTO user_sessions 
       (id, user_id, tenant_id, is_active, expires_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND), ?, ?)`,
      [sessionId, user.id, user.tenantId, true, ttl, metadata?.ipAddress, metadata?.userAgent],
      user.tenantId
    );

    return session;
  }

  private async updateSessionActivity(sessionId: string): Promise<void> {
    const session = await redis.getSession<UserSession>(sessionId);
    if (session) {
      session.lastActivityAt = new Date();
      await redis.setSession(sessionId, session);
    }

    // Also update in database
    await db.query("UPDATE user_sessions SET last_activity_at = CURRENT_TIMESTAMP WHERE id = ?", [sessionId]);
  }

  private async invalidateUserSessions(userId: string, tenantId: string): Promise<void> {
    // Get all active sessions
    const sessions = await this.getUserSessions(userId, tenantId);

    // Deactivate all sessions
    for (const session of sessions) {
      await this.revokeSession(userId, session.id, tenantId);
    }
  }

  private async logSecurityEvent(
    event: SecurityEvent,
    userId: string | null,
    tenantId: string,
    metadata?: any
  ): Promise<void> {
    try {
      await db.query(
        "INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, metadata) VALUES (?, ?, ?, ?, ?)",
        [tenantId, userId, event, "security", JSON.stringify(metadata)],
        tenantId
      );
    } catch (error: any) {
      moduleLogger.error("Error logging security event:", error);
    }
  }

  private getTokenExpiresIn(expiresIn: string): number {
    // Convert string like "7d", "15m", "1h" to seconds
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return 3600; // Default 1 hour

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case "s":
        return value;
      case "m":
        return value * 60;
      case "h":
        return value * 3600;
      case "d":
        return value * 86400;
      default:
        return 3600;
    }
  }

  private mapToAuthUser(user: UserEntity): AuthUser {
    const userData = user.getRawData();
    return {
      id: userData.id,
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName,
      role: userData.role,
      tenantId: userData.tenant_id,
      isActive: userData.isActive,
      isVerified: userData.isVerified,
      lastLoginAt: userData.lastLoginAt,
      createdAt: userData.created_at,
      updatedAt: userData.updated_at,
    };
  }
}
