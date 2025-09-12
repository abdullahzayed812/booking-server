import { db } from "@/shared/config/database";
import { redis } from "@/shared/config/redis";
import { createModuleLogger } from "@/shared/config/logger";
import { CACHE_KEYS, NotFoundError, ConflictError } from "@/shared/types/common.types";
import { UserRole } from "@/shared/types/common.types";
import { CreateUserData, UpdateUserData, UserEntity } from "../models/user.model";

const moduleLogger = createModuleLogger("UserRepository");

export class UserRepository {
  private readonly CACHE_TTL = 900; // 15 minutes

  async create(userData: CreateUserData): Promise<UserEntity> {
    try {
      // Check if user already exists
      const existingUser = await this.findByEmail(userData.email, userData.tenantId);
      if (existingUser) {
        throw new ConflictError("User with this email already exists");
      }

      const userEntity = UserEntity.create(userData);
      const dbData = userEntity.toDatabaseFormat();

      const result = await db.query<{ insertId: string }>(
        `INSERT INTO users (
          tenant_id, email, password_hash, first_name, last_name, 
          phone, date_of_birth, role, is_active, is_verified,
          password_changed_at, token_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          dbData.tenant_id,
          dbData.email,
          dbData.password_hash,
          dbData.first_name,
          dbData.last_name,
          dbData.phone,
          dbData.date_of_birth,
          dbData.role,
          dbData.is_active,
          dbData.is_verified,
          dbData.password_changed_at,
          dbData.token_version,
        ],
        userData.tenantId
      );

      // Fetch the created user
      const createdUser = await this.findById(result[0].insertId, userData.tenantId);
      if (!createdUser) {
        throw new Error("Failed to create user");
      }

      // Create role-specific profile
      if (userData.role === UserRole.DOCTOR) {
        await this.createDoctorProfile(createdUser.id, userData.tenantId);
      } else if (userData.role === UserRole.PATIENT) {
        await this.createPatientProfile(createdUser.id, userData.tenantId);
      }

      moduleLogger.info(
        {
          userId: createdUser.id,
          tenantId: userData.tenantId,
          role: userData.role,
        },
        "User created successfully"
      );

      return createdUser;
    } catch (error: any) {
      moduleLogger.error("Error creating user:", error);
      throw error;
    }
  }

  async findById(id: string, tenantId: string): Promise<UserEntity | null> {
    try {
      // Try cache first
      const cacheKey = CACHE_KEYS.USER(id);
      const cached = await redis.get<any>(cacheKey, tenantId);
      if (cached) {
        return UserEntity.fromDatabase(cached);
      }

      // Query database
      const userData = await db.queryOne(
        "SELECT * FROM users WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
        [id, tenantId],
        tenantId
      );

      if (!userData) {
        return null;
      }

      const userEntity = UserEntity.fromDatabase(userData);

      // Cache for 15 minutes
      await redis.set(cacheKey, userData, this.CACHE_TTL, tenantId);

      return userEntity;
    } catch (error: any) {
      moduleLogger.error("Error finding user by ID:", error);
      throw error;
    }
  }

  async findByEmail(email: string, tenantId: string): Promise<UserEntity | null> {
    try {
      const userData = await db.queryOne(
        "SELECT * FROM users WHERE email = ? AND tenant_id = ? AND deleted_at IS NULL",
        [email, tenantId],
        tenantId
      );

      if (!userData) {
        return null;
      }

      const userEntity = UserEntity.fromDatabase(userData);

      // Cache the user
      const cacheKey = CACHE_KEYS.USER(userEntity.id);
      await redis.set(cacheKey, userData, this.CACHE_TTL, tenantId);

      return userEntity;
    } catch (error: any) {
      moduleLogger.error("Error finding user by email:", error);
      throw error;
    }
  }

  async update(id: string, updateData: UpdateUserData, tenantId: string): Promise<UserEntity> {
    try {
      const user = await this.findById(id, tenantId);
      if (!user) {
        throw new NotFoundError("User not found");
      }

      user.update(updateData);
      const dbData = user.toDatabaseFormat();

      await db.query(
        `UPDATE users SET 
          first_name = ?, last_name = ?, phone = ?, date_of_birth = ?,
          is_active = ?, is_verified = ?, email_verified_at = ?,
          last_login_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND tenant_id = ?`,
        [
          dbData.first_name,
          dbData.last_name,
          dbData.phone,
          dbData.date_of_birth,
          dbData.is_active,
          dbData.is_verified,
          dbData.email_verified_at,
          dbData.last_login_at,
          id,
          tenantId,
        ],
        tenantId
      );

      // Invalidate cache
      await redis.del(CACHE_KEYS.USER(id), tenantId);

      moduleLogger.info(
        {
          userId: id,
          tenantId,
          updates: Object.keys(updateData),
        },
        "User updated successfully"
      );

      return user;
    } catch (error: any) {
      moduleLogger.error("Error updating user:", error);
      throw error;
    }
  }

  async updatePassword(id: string, newPasswordHash: string, tenantId: string): Promise<void> {
    try {
      const user = await this.findById(id, tenantId);
      if (!user) {
        throw new NotFoundError("User not found");
      }

      user.updatePassword(newPasswordHash);
      const dbData = user.toDatabaseFormat();

      await db.query(
        `UPDATE users SET 
          password_hash = ?, password_changed_at = ?, token_version = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND tenant_id = ?`,
        [dbData.password_hash, dbData.password_changed_at, dbData.token_version, id, tenantId],
        tenantId
      );

      // Invalidate cache
      await redis.del(CACHE_KEYS.USER(id), tenantId);

      moduleLogger.info(
        {
          userId: id,
          tenantId,
        },
        "User password updated successfully"
      );
    } catch (error: any) {
      moduleLogger.error("Error updating user password:", error);
      throw error;
    }
  }

  async markEmailAsVerified(id: string, tenantId: string): Promise<void> {
    try {
      const user = await this.findById(id, tenantId);
      if (!user) {
        throw new NotFoundError("User not found");
      }

      user.markEmailAsVerified();
      const dbData = user.toDatabaseFormat();

      await db.query(
        `UPDATE users SET 
          is_verified = ?, email_verified_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND tenant_id = ?`,
        [dbData.is_verified, dbData.email_verified_at, id, tenantId],
        tenantId
      );

      // Invalidate cache
      await redis.del(CACHE_KEYS.USER(id), tenantId);

      moduleLogger.info(
        {
          userId: id,
          tenantId,
        },
        "User email verified successfully"
      );
    } catch (error: any) {
      moduleLogger.error("Error marking email as verified:", error);
      throw error;
    }
  }

  async invalidateUserTokens(id: string, tenantId: string): Promise<void> {
    try {
      const user = await this.findById(id, tenantId);
      if (!user) {
        throw new NotFoundError("User not found");
      }

      user.invalidateTokens();
      const dbData = user.toDatabaseFormat();

      await db.query(
        "UPDATE users SET token_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?",
        [dbData.token_version, id, tenantId],
        tenantId
      );

      // Invalidate cache
      await redis.del(CACHE_KEYS.USER(id), tenantId);

      // Also invalidate all user sessions
      await redis.del(`user_sessions:${id}`, tenantId);

      moduleLogger.info(
        {
          userId: id,
          tenantId,
        },
        "User tokens invalidated successfully"
      );
    } catch (error: any) {
      moduleLogger.error("Error invalidating user tokens:", error);
      throw error;
    }
  }

  async findByRole(role: UserRole, tenantId: string, limit = 50, offset = 0): Promise<UserEntity[]> {
    try {
      const users = await db.query(
        `SELECT * FROM users 
         WHERE role = ? AND tenant_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [role, tenantId, limit, offset],
        tenantId
      );

      return users.map((userData) => UserEntity.fromDatabase(userData));
    } catch (error: any) {
      moduleLogger.error("Error finding users by role:", error);
      throw error;
    }
  }

  async softDelete(id: string, tenantId: string): Promise<void> {
    try {
      await db.query(
        "UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?",
        [id, tenantId],
        tenantId
      );

      // Invalidate cache
      await redis.del(CACHE_KEYS.USER(id), tenantId);

      moduleLogger.info(
        {
          userId: id,
          tenantId,
        },
        "User soft deleted successfully"
      );
    } catch (error: any) {
      moduleLogger.error("Error soft deleting user:", error);
      throw error;
    }
  }

  private async createDoctorProfile(userId: string, tenantId: string): Promise<void> {
    await db.query(
      `INSERT INTO doctors (id, tenant_id, specialization, consultation_duration, is_accepting_appointments)
       VALUES (?, ?, 'General Practice', 30, true)`,
      [userId, tenantId],
      tenantId
    );
  }

  private async createPatientProfile(userId: string, tenantId: string): Promise<void> {
    await db.query("INSERT INTO patients (id, tenant_id) VALUES (?, ?)", [userId, tenantId], tenantId);
  }
}
