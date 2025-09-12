import { Request, Response, NextFunction } from "express";
import { config } from "@/shared/config/environment";
import { logger } from "@/shared/config/logger";
import { ApiResponse, AppError } from "@/shared/types/common.types";

export const errorHandler = (error: Error | AppError, req: Request, res: Response, next: NextFunction): void => {
  // If response was already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(error);
  }

  let statusCode = 500;
  let code = "INTERNAL_ERROR";
  let message = "Internal server error";
  let errors: any[] = [];

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;

    if (error.name === "ValidationError") {
      errors = [
        {
          field: "validation",
          message: error.message,
          code: error.code,
        },
      ];
    }
  } else {
    // Log unexpected errors
    logger.error("Unexpected error:", {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      request: {
        method: req.method,
        url: req.originalUrl,
        headers: req.headers,
        body: config.app.isDevelopment ? req.body : "[REDACTED]",
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        correlationId: req.correlationId,
        tenantId: req.tenantId,
        userId: req.user?.id,
      },
    });

    // Don't expose internal error details in production
    if (config.app.isProduction) {
      message = "Internal server error";
    } else {
      message = error.message;
    }
  }

  const errorResponse: ApiResponse = {
    success: false,
    message,
    errors: errors.length > 0 ? errors : undefined,
    ...(config.app.isDevelopment && {
      debug: {
        stack: error.stack,
        correlationId: req.correlationId,
      },
    }),
  };

  res.status(statusCode).json(errorResponse);
};

export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  const error = new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404, "ROUTE_NOT_FOUND");
  next(error);
};
