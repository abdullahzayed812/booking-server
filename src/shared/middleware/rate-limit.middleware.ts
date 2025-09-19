import rateLimit from "express-rate-limit";
import { config } from "@/shared/config/environment";
import { redis } from "@/shared/config/redis";
import { ApiResponse } from "@/shared/types/common.types";

// Custom rate limit store using Redis
class RedisStore {
  constructor(private windowMs: number) {}

  async increment(key: string): Promise<{ totalHits: number; timeToExpire?: number }> {
    const redisClient = redis.getClient();
    const multi = redisClient.multi();
    const expires = Math.round(this.windowMs / 1000);

    multi.incr(key);
    multi.expire(key, expires);

    const results = await multi.exec();

    // Ensure results are in expected format: [ [null, number], [null, 'OK'] ]
    const incrResult = results?.[0];
    const totalHits = Array.isArray(incrResult) && typeof incrResult[1] === "number" ? incrResult[1] : 1; // fallback to 1 to avoid invalid totalHits = 0

    return {
      totalHits,
      timeToExpire: expires * 1000,
    };
  }

  async decrement(key: string): Promise<void> {
    await redis.getClient().decr(key);
  }

  async resetKey(key: string): Promise<void> {
    await redis.getClient().del(key);
  }
}

// General rate limiting
export const generalRateLimit = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    success: false,
    message: "Too many requests, please try again later",
    code: "RATE_LIMIT_EXCEEDED",
  } as ApiResponse,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore(config.rateLimit.windowMs) as any,
  // keyGenerator: (req) => {
  //   return `rate_limit:general:${req.ip}:${req.tenantId || "no-tenant"}`;
  // },
  skip: (req) => {
    // Skip rate limiting for health checks and system endpoints
    return req.path.startsWith("/health") || req.path.startsWith("/metrics") || req.path.startsWith("/api/system");
  },
});

// Strict rate limiting for authentication endpoints
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    success: false,
    message: "Too many authentication attempts, please try again later",
    code: "AUTH_RATE_LIMIT_EXCEEDED",
  } as ApiResponse,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore(15 * 60 * 1000) as any,
  // keyGenerator: (req) => {
  //   // Use email from request body for login attempts, IP otherwise
  //   const identifier = req.body?.email || req.ip;
  //   return `rate_limit:auth:${identifier}:${req.tenantId || "no-tenant"}`;
  // },
});

// Password-related rate limiting (more restrictive)
export const passwordRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 attempts per hour
  message: {
    success: false,
    message: "Too many password change attempts, please try again later",
    code: "PASSWORD_RATE_LIMIT_EXCEEDED",
  } as ApiResponse,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore(60 * 60 * 1000) as any,
  // keyGenerator: (req) => {
  //   const userId = req.user?.id || req.ip;
  //   return `rate_limit:password:${userId}:${req.tenantId}`;
  // },
});

// API creation rate limiting
export const createResourceRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 creations per minute
  message: {
    success: false,
    message: "Too many creation requests, please slow down",
    code: "CREATE_RATE_LIMIT_EXCEEDED",
  } as ApiResponse,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore(60 * 1000) as any,
  // keyGenerator: (req) => {
  //   const userId = req.user?.id || req.ip;
  //   return `rate_limit:create:${userId}:${req.tenantId}`;
  // },
});

// WebSocket connection rate limiting
export const websocketRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // 100 WebSocket events per 5 minutes
  message: {
    success: false,
    message: "Too many WebSocket events, please slow down",
    code: "WEBSOCKET_RATE_LIMIT_EXCEEDED",
  } as ApiResponse,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore(5 * 60 * 1000) as any,
  // keyGenerator: (req) => {
  //   const userId = req.user?.id || req.ip;
  //   return `rate_limit:websocket:${userId}:${req.tenantId}`;
  // },
});
