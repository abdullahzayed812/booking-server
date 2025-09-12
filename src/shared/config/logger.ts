import pino, { Logger } from "pino";
import { config } from "./environment";

const loggerConfig = {
  level: config.logging.level,
  ...(config.logging.format === "pretty" && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "yyyy-mm-dd HH:MM:ss",
        ignore: "pid,hostname",
      },
    },
  }),
  ...(config.app.isProduction && {
    formatters: {
      level: (label: string) => {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  }),
};

export const logger: Logger = pino(loggerConfig);

// Helper functions for consistent logging
export const createModuleLogger = (module: string): Logger => {
  return logger.child({ module });
};

export const logRequest = (req: any, res: any) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.originalUrl || req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get("User-Agent"),
      ip: req.ip || req.connection.remoteAddress,
      tenantId: req.tenantId,
      userId: req.user?.id,
    };

    if (res.statusCode >= 400) {
      logger.warn(logData, "HTTP Request Error");
    } else {
      logger.info(logData, "HTTP Request");
    }
  });
};

export const logError = (error: Error, context?: any) => {
  logger.error(
    {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      context,
    },
    "Application Error"
  );
};

export const logDatabaseQuery = (query: string, params?: any, duration?: number) => {
  logger.debug(
    {
      query: query.replace(/\s+/g, " ").trim(),
      params,
      duration: duration ? `${duration}ms` : undefined,
    },
    "Database Query"
  );
};

export const logWebSocketEvent = (event: string, data?: any, socketId?: string) => {
  logger.info(
    {
      event,
      data: config.app.isDevelopment ? data : undefined,
      socketId,
    },
    "WebSocket Event"
  );
};
