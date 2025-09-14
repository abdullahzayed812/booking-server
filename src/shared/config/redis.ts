import { createClient, RedisClientType } from "redis";
import { config } from "./environment";
import { logger } from "./logger";

class RedisManager {
  private client: RedisClientType;
  private publisher: RedisClientType;
  private subscriber: RedisClientType;
  private static instance: RedisManager;

  private constructor() {
    const redisConfig = {
      socket: {
        host: config.redis.host,
        port: config.redis.port,
      },
      ...(config.redis.password && { password: config.redis.password }),
      database: config.redis.db,
    };

    this.client = createClient(redisConfig);
    this.publisher = createClient(redisConfig);
    this.subscriber = createClient(redisConfig);

    this.setupEventHandlers();
    this.connect();
  }

  public static getInstance(): RedisManager {
    if (!RedisManager.instance) {
      RedisManager.instance = new RedisManager();
    }
    return RedisManager.instance;
  }

  private setupEventHandlers(): void {
    // Main client events
    this.client.on("connect", () => logger.info("✅ Redis client connected"));
    this.client.on("error", (error) => logger.error(error, "❌ Redis client error:"));

    // Publisher events
    this.publisher.on("connect", () => logger.info("✅ Redis publisher connected"));
    this.publisher.on("error", (error) => logger.error(error, "❌ Redis publisher error:"));

    // Subscriber events
    this.subscriber.on("connect", () => logger.info("✅ Redis subscriber connected"));
    this.subscriber.on("error", (error) => logger.error(error, "❌ Redis subscriber error:"));
  }

  private async connect(): Promise<void> {
    try {
      await Promise.all([this.client.connect(), this.publisher.connect(), this.subscriber.connect()]);
      logger.info("✅ All Redis connections established");
    } catch (error: any) {
      logger.error("❌ Redis connection failed:", error);
      process.exit(1);
    }
  }

  // Cache operations with tenant isolation
  public async set(key: string, value: any, ttl?: number, tenantId?: string): Promise<void> {
    const tenantKey = this.getTenantKey(key, tenantId);
    const serializedValue = JSON.stringify(value);

    if (ttl) {
      await this.client.setEx(tenantKey, ttl, serializedValue);
    } else {
      await this.client.set(tenantKey, serializedValue);
    }
  }

  public async get<T = any>(key: string, tenantId?: string): Promise<T | null> {
    const tenantKey = this.getTenantKey(key, tenantId);
    const value = await this.client.get(tenantKey);

    if (!value) return null;

    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }

  public async del(key: string, tenantId?: string): Promise<void> {
    const tenantKey = this.getTenantKey(key, tenantId);
    await this.client.del(tenantKey);
  }

  public async exists(key: string, tenantId?: string): Promise<boolean> {
    const tenantKey = this.getTenantKey(key, tenantId);
    const result = await this.client.exists(tenantKey);
    return result === 1;
  }

  public async expire(key: string, ttl: number, tenantId?: string): Promise<void> {
    const tenantKey = this.getTenantKey(key, tenantId);
    await this.client.expire(tenantKey, ttl);
  }

  // Hash operations
  public async hSet(key: string, field: string, value: any, tenantId?: string): Promise<void> {
    const tenantKey = this.getTenantKey(key, tenantId);
    const serializedValue = JSON.stringify(value);
    await this.client.hSet(tenantKey, field, serializedValue);
  }

  public async hGet<T = any>(key: string, field: string, tenantId?: string): Promise<T | null> {
    const tenantKey = this.getTenantKey(key, tenantId);
    const value = await this.client.hGet(tenantKey, field);

    if (!value) return null;

    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }

  public async hDel(key: string, field: string, tenantId?: string): Promise<void> {
    const tenantKey = this.getTenantKey(key, tenantId);
    await this.client.hDel(tenantKey, field);
  }

  // List operations
  public async lPush(key: string, values: any[], tenantId?: string): Promise<void> {
    const tenantKey = this.getTenantKey(key, tenantId);
    const serializedValues = values.map((v) => JSON.stringify(v));
    await this.client.lPush(tenantKey, serializedValues);
  }

  public async lRange<T = any>(key: string, start: number, stop: number, tenantId?: string): Promise<T[]> {
    const tenantKey = this.getTenantKey(key, tenantId);
    const values = await this.client.lRange(tenantKey, start, stop);

    return values.map((value) => {
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    });
  }

  // Pub/Sub operations
  public async publish(channel: string, message: any): Promise<void> {
    const serializedMessage = JSON.stringify(message);
    await this.publisher.publish(channel, serializedMessage);
  }

  public async subscribe(channel: string, callback: (message: any) => void): Promise<void> {
    await this.subscriber.subscribe(channel, (message) => {
      try {
        const parsedMessage = JSON.parse(message);
        callback(parsedMessage);
      } catch {
        callback(message);
      }
    });
  }

  public async unsubscribe(channel: string): Promise<void> {
    await this.subscriber.unsubscribe(channel);
  }

  // Session management
  public async setSession(sessionId: string, data: any, ttl: number = 3600): Promise<void> {
    await this.set(`session:${sessionId}`, data, ttl);
  }

  public async getSession<T = any>(sessionId: string): Promise<T | null> {
    return await this.get<T>(`session:${sessionId}`);
  }

  public async deleteSession(sessionId: string): Promise<void> {
    await this.del(`session:${sessionId}`);
  }

  // Rate limiting
  public async incrementRateLimit(key: string, windowMs: number, tenantId?: string): Promise<number> {
    const tenantKey = this.getTenantKey(`rate_limit:${key}`, tenantId);
    const current = await this.client.incr(tenantKey);

    if (current === 1) {
      await this.client.expire(tenantKey, Math.ceil(windowMs / 1000));
    }

    return current;
  }

  // Helper methods
  private getTenantKey(key: string, tenantId?: string): string {
    return tenantId ? `tenant:${tenantId}:${key}` : key;
  }

  public async flushTenant(tenantId: string): Promise<void> {
    const pattern = `tenant:${tenantId}:*`;
    const keys = await this.client.keys(pattern);

    if (keys.length > 0) {
      await this.client.del(keys);
    }
  }

  public async close(): Promise<void> {
    try {
      await Promise.all([this.client.disconnect(), this.publisher.disconnect(), this.subscriber.disconnect()]);
      logger.info("Redis connections closed");
    } catch (error: any) {
      logger.error("Error closing Redis connections:", error);
    }
  }

  // Getters for direct access if needed
  public getClient(): RedisClientType {
    return this.client;
  }

  public getPublisher(): RedisClientType {
    return this.publisher;
  }

  public getSubscriber(): RedisClientType {
    return this.subscriber;
  }
}

// Export singleton instance
export const redis = RedisManager.getInstance();
