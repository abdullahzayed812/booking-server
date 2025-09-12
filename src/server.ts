import { createServer } from "http";
import { config } from "./shared/config/environment";
import { logger } from "./shared/config/logger";
import { db } from "./shared/config/database";
import { redis } from "./shared/config/redis";
import App from "./app";
import { WebSocketManager } from "./websocket/socket.manager";

class Server {
  private app: App;
  private httpServer: any;
  private webSocketManager: WebSocketManager;

  constructor() {
    this.app = new App();
    this.httpServer = createServer(this.app.getApp());
    this.webSocketManager = WebSocketManager.getInstance(this.httpServer);

    this.setupGracefulShutdown();
  }

  public async start(): Promise<void> {
    try {
      // Start the HTTP server
      this.httpServer.listen(config.app.port, () => {
        logger.info(`🚀 Server started successfully!`, {
          name: config.app.name,
          port: config.app.port,
          environment: config.app.env,
          nodeVersion: process.version,
          timestamp: new Date(),
        });

        if (config.app.isDevelopment) {
          logger.info(`📖 API Documentation: http://localhost:${config.app.port}/docs`);
          logger.info(`🏥 API Base URL: http://localhost:${config.app.port}/api/${config.app.apiVersion}`);
          logger.info(`⚡ WebSocket Server: ws://localhost:${config.app.port}`);
        }
      });

      // Set up server error handling
      this.httpServer.on("error", (error: NodeJS.ErrnoException) => {
        if (error.syscall !== "listen") {
          throw error;
        }

        const bind = typeof config.app.port === "string" ? "Pipe " + config.app.port : "Port " + config.app.port;

        switch (error.code) {
          case "EACCES":
            logger.error(`${bind} requires elevated privileges`);
            process.exit(1);
            break;
          case "EADDRINUSE":
            logger.error(`${bind} is already in use`);
            process.exit(1);
            break;
          default:
            throw error;
        }
      });

      // Log successful startup metrics
      this.logStartupMetrics();
    } catch (error) {
      logger.error("Failed to start server:", error);
      process.exit(1);
    }
  }

  private logStartupMetrics(): void {
    const memoryUsage = process.memoryUsage();
    const startupTime = process.uptime();

    logger.info("📊 Startup Metrics:", {
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`,
      },
      startupTime: `${startupTime.toFixed(2)}s`,
      pid: process.pid,
      platform: process.platform,
      nodeVersion: process.version,
    });
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`📴 Received ${signal}. Starting graceful shutdown...`);

      try {
        // Stop accepting new requests
        this.httpServer.close(async () => {
          logger.info("✅ HTTP server closed");

          try {
            // Close WebSocket connections
            await this.webSocketManager.close();
            logger.info("✅ WebSocket server closed");

            // Close database connections
            await db.close();
            logger.info("✅ Database connections closed");

            // Close Redis connections
            await redis.close();
            logger.info("✅ Redis connections closed");

            logger.info("👋 Graceful shutdown completed");
            process.exit(0);
          } catch (error) {
            logger.error("❌ Error during graceful shutdown:", error);
            process.exit(1);
          }
        });

        // Force shutdown after 30 seconds
        setTimeout(() => {
          logger.error("⏰ Graceful shutdown timeout, forcing exit");
          process.exit(1);
        }, 30000);
      } catch (error) {
        logger.error("❌ Error during shutdown:", error);
        process.exit(1);
      }
    };

    // Handle process termination signals
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    // Handle uncaught exceptions
    process.on("uncaughtException", (error) => {
      logger.error("💥 Uncaught Exception:", error);
      shutdown("uncaughtException");
    });

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (reason, promise) => {
      logger.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
      shutdown("unhandledRejection");
    });

    // Handle process warnings
    process.on("warning", (warning) => {
      logger.warn("⚠️ Process Warning:", {
        name: warning.name,
        message: warning.message,
        stack: warning.stack,
      });
    });
  }

  public getApp(): App {
    return this.app;
  }

  public getHttpServer(): any {
    return this.httpServer;
  }

  public getWebSocketManager(): WebSocketManager {
    return this.webSocketManager;
  }
}

// Start the server if this file is executed directly
if (require.main === module) {
  const server = new Server();
  server.start().catch((error) => {
    logger.error("Failed to start application:", error);
    process.exit(1);
  });
}

export default Server;
