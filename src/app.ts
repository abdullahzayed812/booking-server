import express, { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { config } from "./shared/config/environment";
import { logger, logRequest } from "./shared/config/logger";
import { ApiResponse, AppError } from "./shared/types/common.types";
import { authRoutes } from "./domains/auth";
import swaggerUi from "swagger-ui-express";
import { createSwaggerSpec } from "./api/swagger/swagger.config";

class App {
  public app: Application;

  constructor() {
    this.app = express();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeSwagger();
    this.initializeErrorHandling();
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'", "h"],
            // scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            // styleSrc: ["'self'", "'unsafe-inline'"],
            // imgSrc: ["'self'", "data:", "https:"],
          },
        },
        crossOriginEmbedderPolicy: false, // For Socket.IO compatibility
      })
    );

    // CORS configuration
    this.app.use(
      cors({
        origin: (origin, callback) => {
          // Allow requests with no origin (mobile apps, Postman, etc.)
          if (!origin) return callback(null, true);

          if (config.cors.origins.includes(origin)) {
            return callback(null, true);
          }

          // In development, allow localhost with any port
          if (config.app.isDevelopment && origin.includes("localhost")) {
            return callback(null, true);
          }

          return callback(new Error("Not allowed by CORS"), false);
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: [
          "Origin",
          "X-Requested-With",
          "Content-Type",
          "Accept",
          "Authorization",
          "X-Tenant-ID",
          "X-Tenant-Subdomain",
          "X-Correlation-ID",
        ],
      })
    );

    // Compression middleware
    this.app.use(compression());

    // Body parsing middleware
    this.app.use(
      express.json({
        limit: "10mb",
        verify: (req, res, buf) => {
          // Store raw body for webhook verification if needed
          (req as any).rawBody = buf;
        },
      })
    );
    this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // Request logging middleware
    if (config.app.isDevelopment) {
      this.app.use(morgan("dev"));
    } else {
      this.app.use(
        morgan("combined", {
          stream: {
            write: (message: string) => logger.info(message.trim()),
          },
        })
      );
    }

    // Custom request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      logRequest(req, res);
      next();
    });

    // Global rate limiting
    const globalRateLimit = rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.maxRequests * 2, // More generous for global limit
      message: {
        success: false,
        message: "Too many requests from this IP, please try again later",
        code: "RATE_LIMIT_EXCEEDED",
      },
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => {
        // Skip rate limiting for health checks and system endpoints
        return req.path.startsWith("/health") || req.path.startsWith("/metrics") || req.path.startsWith("/api/system");
      },
    });

    this.app.use(globalRateLimit);

    // Request correlation ID middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const correlationId =
        (req.headers["x-correlation-id"] as string) || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      req.correlationId = correlationId;
      res.setHeader("X-Correlation-ID", correlationId);
      next();
    });

    // Trust proxy headers (for proper IP detection behind load balancers, or reverse proxy eg. Nginx)
    this.app.set("trust proxy", 1);
  }

  private initializeRoutes(): void {
    // Health check endpoint
    this.app.get("/health", (req: Request, res: Response) => {
      const healthCheck: ApiResponse = {
        success: true,
        data: {
          service: config.app.name,
          version: "1.0.0",
          environment: config.app.env,
          timestamp: new Date(),
          uptime: process.uptime(),
          memory: process.memoryUsage(),
        },
        message: "Service is healthy",
      };
      res.status(200).json(healthCheck);
    });

    // API version routing
    const apiV1 = express.Router();

    // Mount domain routes
    apiV1.use("/auth", authRoutes);
    // apiV1.use('/appointments', appointmentRoutes); // To be implemented
    // apiV1.use('/doctors', doctorRoutes); // To be implemented
    // apiV1.use('/patients', patientRoutes); // To be implemented
    // apiV1.use('/notifications', notificationRoutes); // To be implemented
    // apiV1.use('/analytics', analyticsRoutes); // To be implemented

    this.app.use(`/api/${config.app.apiVersion}`, apiV1);

    // System routes (no tenant required)
    this.app.get("/api/system/info", (req: Request, res: Response) => {
      const systemInfo: ApiResponse = {
        success: true,
        data: {
          name: config.app.name,
          version: "1.0.0",
          environment: config.app.env,
          nodeVersion: process.version,
          timestamp: new Date(),
        },
        message: "System information",
      };
      res.status(200).json(systemInfo);
    });

    // Catch-all route for unmatched endpoints
    this.app.all("*", (req: Request, res: Response) => {
      const error: ApiResponse = {
        success: false,
        message: `Route ${req.method} ${req.originalUrl} not found`,
        errors: [
          {
            field: "route",
            message: "Endpoint not found",
            code: "ROUTE_NOT_FOUND",
          },
        ],
      };
      res.status(404).json(error);
    });
  }

  private initializeSwagger(): void {
    if (config.swagger.enabled) {
      const swaggerSpec = createSwaggerSpec();

      this.app.use(
        "/docs",
        swaggerUi.serve,
        swaggerUi.setup(swaggerSpec, {
          explorer: true,
          customCss: ".swagger-ui .topbar { display: none }",
          customSiteTitle: `${config.app.name} - API Documentation`,
          swaggerOptions: {
            docExpansion: "none",
            filter: true,
            showRequestDuration: true,
          },
        })
      );

      this.app.get("/docs/swagger.json", (req: Request, res: Response) => {
        res.setHeader("Content-Type", "application/json");
        res.send(swaggerSpec);
      });

      logger.info("Swagger documentation available at /docs");
    }
  }

  private initializeErrorHandling(): void {
    // 404 handler (should be before error handler)
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const error = new AppError("Route not found", 404, "ROUTE_NOT_FOUND");
      next(error);
    });

    // Global error handler
    this.app.use((error: Error | AppError, req: Request, res: Response, next: NextFunction) => {
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
        logger.error(
          {
            error: {
              message: error.message,
              stack: error.stack,
              name: error.name,
            },
            request: {
              method: req.method,
              url: req.originalUrl,
              headers: req.headers,
              body: req.body,
              ip: req.ip,
              userAgent: req.get("User-Agent"),
              correlationId: req.correlationId,
              tenantId: req.tenantId,
              userId: req.user?.id,
            },
          },
          "Unexpected error:"
        );

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
        errors: errors.length > 0 ? errors : [],
        ...(config.app.isDevelopment && {
          debug: {
            stack: error.stack,
            correlationId: req.correlationId,
          },
        }),
      };

      res.status(statusCode).json(errorResponse);
    });
  }

  public getApp(): Application {
    return this.app;
  }
}

export default App;
