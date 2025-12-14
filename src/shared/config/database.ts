import mysql from "mysql2/promise";
import { config } from "./environment";
import { logger, logDatabaseQuery } from "./logger";

class DatabaseManager {
  private pool: mysql.Pool;
  private static instance: DatabaseManager;

  private constructor() {
    this.pool = mysql.createPool({
      host: config.database.host,
      port: config.database.port,
      user: config.database.user,
      password: config.database.password,
      database: config.database.name,
      connectionLimit: config.database.connectionLimit,
      // acquireTimeout: 60000,
      // timeout: 60000,
      // reconnect: true,
      // charset: 'utf8mb4',
      // timezone: '+00:00', // Store everything in UTC
      // supportBigNumbers: true,
      // bigNumberStrings: true,
      // dateStrings: ['DATE', 'DATETIME'],
    });

    // Test connection on startup
    this.testConnection();
  }

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  private async testConnection(): Promise<void> {
    try {
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();
      logger.info("✅ Database connected successfully");
    } catch (error: any) {
      logger.error("❌ Database connection failed:", error);
      process.exit(1);
    }
  }

  public async query<T = any>(sql: string, params: any[] = [], tenantId?: string): Promise<T[]> {
    const start = Date.now();

    try {
      const [rows] = await this.pool.execute(sql, params);
      const duration = Date.now() - start;

      if (config.app.isDevelopment) {
        logDatabaseQuery(sql, params, duration);
      }

      return rows as T[];
    } catch (error) {
      const duration = Date.now() - start;
      logger.error(
        {
          error,
          sql,
          params,
          tenantId,
          duration: `${duration}ms`,
        },
        "Database query failed"
      );
      throw error;
    }
  }

  public async queryOne<T = any>(sql: string, params: any[] = [], tenantId?: string): Promise<T | null> {
    const results = await this.query<T>(sql, params, tenantId);
    return results.length > 0 ? (results[0] as T) : null;
  }

  public async transaction<T>(
    callback: (connection: mysql.PoolConnection) => Promise<T>,
    tenantId?: string
  ): Promise<T> {
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      // Store tenant context for transaction
      if (tenantId) {
        (connection as any).tenantId = tenantId;
      }

      const result = await callback(connection);
      await connection.commit();

      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  public async executeTransaction<T = any>(
    sql: string,
    params: any[] = [],
    connection: mysql.PoolConnection,
    tenantId?: string
  ): Promise<T[]> {
    const start = Date.now();

    try {
      const [rows] = await connection.execute(sql, params);
      const duration = Date.now() - start;

      if (config.app.isDevelopment) {
        logDatabaseQuery(sql, params, duration);
      }

      return rows as T[];
    } catch (error) {
      const duration = Date.now() - start;
      logger.error(
        {
          error,
          sql,
          params,
          tenantId,
          duration: `${duration}ms`,
        },
        "Transaction query failed"
      );
      throw error;
    }
  }

  public async close(): Promise<void> {
    try {
      await this.pool.end();
      logger.info("Database connection pool closed");
    } catch (error: any) {
      logger.error("Error closing database connection pool:", error);
    }
  }

  public getPool(): mysql.Pool {
    return this.pool;
  }
}

// Export singleton instance
export const db = DatabaseManager.getInstance();
