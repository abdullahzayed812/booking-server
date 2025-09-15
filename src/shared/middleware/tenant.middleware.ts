import { Request, Response, NextFunction } from "express";
// import { z } from "zod";
import { db } from "../config/database";
import { redis } from "../config/redis";
import { logger } from "../config/logger";
import { AppError, CACHE_KEYS } from "../types/common.types";

interface Tenant {
  id: string;
  name: string;
  subdomain: string;
  isActive: boolean;
  settings: any;
  createdAt: Date;
  updatedAt: Date;
}

// const tenantHeaderSchema = z.object({
//   "x-tenant-id": z.string().uuid().optional(),
//   "x-tenant-subdomain": z.string().min(1).optional(),
// });

export const tenantMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenantId = req.headers["x-tenant-id"] as string;
    const subdomain = req.headers["x-tenant-subdomain"] as string;
    const hostSubdomain = extractSubdomainFromHost(req.get("host"));

    // Skip tenant validation for health checks and system routes
    if (isSystemRoute(req.path)) {
      return next();
    }

    // Determine tenant identification method
    const identificationMethod = tenantId
      ? "header-id"
      : subdomain
      ? "header-subdomain"
      : hostSubdomain
      ? "host-subdomain"
      : null;

    if (!identificationMethod) {
      throw new AppError("Tenant identification required", 400, "TENANT_REQUIRED");
    }

    // Validate and get tenant
    let tenant: Tenant | null = null;

    if (tenantId) {
      tenant = await getTenantById(tenantId);
    } else if (subdomain || hostSubdomain) {
      const targetSubdomain = subdomain || hostSubdomain;
      tenant = await getTenantBySubdomain(targetSubdomain!);
    }

    if (!tenant) {
      throw new AppError("Tenant not found", 404, "TENANT_NOT_FOUND");
    }

    if (!tenant.isActive) {
      throw new AppError("Tenant is inactive", 403, "TENANT_INACTIVE");
    }

    // Set tenant context in request
    req.tenantId = tenant.id;
    req.tenant = tenant;

    // Set correlation ID for request tracking
    req.correlationId = generateCorrelationId();

    // Log tenant context
    logger.info(
      {
        tenantId: tenant.id,
        tenantName: tenant.name,
        method: identificationMethod,
        correlationId: req.correlationId,
        path: req.path,
      },
      "Tenant context established"
    );

    next();
  } catch (error: any) {
    if (error instanceof AppError) {
      return next(error);
    }

    logger.error("Tenant middleware error:", error);
    next(new AppError("Tenant validation failed", 500, "TENANT_VALIDATION_ERROR"));
  }
};

async function getTenantById(tenantId: string): Promise<Tenant | null> {
  try {
    // Try cache first
    const cached = await redis.get<Tenant>(CACHE_KEYS.TENANT(tenantId));
    if (cached) {
      return cached;
    }

    // Query database
    const tenant = await db.queryOne<Tenant>(`SELECT * FROM tenants WHERE id = ? AND deleted_at IS NULL`, [tenantId]);

    if (tenant) {
      // Cache for 1 hour
      await redis.set(CACHE_KEYS.TENANT(tenantId), tenant, 3600);
    }

    return tenant;
  } catch (error: any) {
    logger.error("Error fetching tenant by ID:", error);
    throw error;
  }
}

async function getTenantBySubdomain(subdomain: string): Promise<Tenant | null> {
  try {
    // Try cache first
    const cacheKey = `tenant:subdomain:${subdomain}`;
    const cached = await redis.get<Tenant>(cacheKey);
    if (cached) {
      return cached;
    }

    // Query database
    const tenant = await db.queryOne<Tenant>("SELECT * FROM tenants WHERE subdomain = ? AND deleted_at IS NULL", [
      subdomain,
    ]);

    if (tenant) {
      // Cache for 1 hour
      await redis.set(cacheKey, tenant, 3600);
      await redis.set(CACHE_KEYS.TENANT(tenant.id), tenant, 3600);
    }

    return tenant;
  } catch (error: any) {
    logger.error("Error fetching tenant by subdomain:", error);
    throw error;
  }
}

function extractSubdomainFromHost(host?: string): string | null {
  if (!host) return null;

  const parts = host.split(".");

  // For development (localhost:port), no subdomain
  if (parts[0] === "localhost" || parts[0]?.includes("localhost")) {
    return null;
  }

  // For production domains (subdomain.domain.com), extract subdomain
  if (parts.length >= 3) {
    return parts[0]!;
  }

  return null;
}

function isSystemRoute(path: string): boolean {
  const systemRoutes = ["/health", "/metrics", "/favicon.ico", "/api/system", "/swagger", "/docs"];

  return systemRoutes.some((route) => path.startsWith(route));
}

function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Middleware to ensure tenant context exists (for authenticated routes)
export const requireTenant = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.tenantId) {
    throw new AppError("Tenant context required", 400, "TENANT_CONTEXT_REQUIRED");
  }
  next();
};

// Helper to get current tenant from request
export const getCurrentTenant = (req: Request): Tenant => {
  if (!req.tenant) {
    throw new AppError("Tenant context not found", 500, "TENANT_CONTEXT_MISSING");
  }
  return req.tenant;
};

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      tenant?: Tenant;
    }
  }
}
