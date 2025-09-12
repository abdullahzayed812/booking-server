import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().transform(Number).default(3000),
  APP_NAME: z.string().default("Doctor Appointment SaaS"),
  API_VERSION: z.string().default("v1"),

  // Database
  DB_HOST: z.string().default("localhost"),
  DB_PORT: z.string().transform(Number).default(3306),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_CONNECTION_LIMIT: z.string().transform(Number).default(10),

  // Redis
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.string().transform(Number).default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.string().transform(Number).default(0),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default(100),

  // Logging
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  LOG_FORMAT: z.enum(["pretty", "json"]).default("pretty"),

  // CORS
  ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),

  // WebSocket
  SOCKET_IO_CORS_ORIGINS: z.string().default("http://localhost:3000"),

  // Swagger
  SWAGGER_ENABLED: z
    .string()
    .transform((val) => val === "true")
    .default(true),
});

let env: z.infer<typeof envSchema>;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  console.error("❌ Invalid environment variables:", error);
  process.exit(1);
}

export const config = {
  app: {
    name: env.APP_NAME,
    port: env.PORT,
    env: env.NODE_ENV,
    apiVersion: env.API_VERSION,
    isDevelopment: env.NODE_ENV === "development",
    isProduction: env.NODE_ENV === "production",
    isTest: env.NODE_ENV === "test",
  },

  database: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    name: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    connectionLimit: env.DB_CONNECTION_LIMIT,
  },

  redis: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    db: env.REDIS_DB,
  },

  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },

  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
  },

  logging: {
    level: env.LOG_LEVEL,
    format: env.LOG_FORMAT,
  },

  cors: {
    origins: env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()),
  },

  websocket: {
    corsOrigins: env.SOCKET_IO_CORS_ORIGINS.split(",").map((origin) => origin.trim()),
  },

  swagger: {
    enabled: env.SWAGGER_ENABLED,
  },
} as const;

export type Config = typeof config;
