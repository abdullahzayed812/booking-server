import { Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";
import { ApiResponse, ValidationError } from "@/shared/types/common.types";
import { createModuleLogger } from "@/shared/config/logger";

const moduleLogger = createModuleLogger("ValidationMiddleware");

export const validateBody = (schema: z.ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = await schema.parseAsync(req.body);
      req.body = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const validationErrors: ValidationError[] = error.errors.map((err) => ({
          field: err.path.join("."),
          message: err.message,
          code: err.code,
        }));

        const response: ApiResponse = {
          success: false,
          message: "Request validation failed",
          errors: validationErrors,
        };

        moduleLogger.warn("Body validation failed:", {
          path: req.path,
          method: req.method,
          errors: validationErrors,
          correlationId: req.correlationId,
        });

        return res.status(400).json(response);
      }
      next(error);
    }
  };
};

export const validateQuery = (schema: z.ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = await schema.parseAsync(req.query);
      req.query = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const validationErrors: ValidationError[] = error.errors.map((err) => ({
          field: err.path.join("."),
          message: err.message,
          code: err.code,
        }));

        const response: ApiResponse = {
          success: false,
          message: "Query validation failed",
          errors: validationErrors,
        };

        return res.status(400).json(response);
      }
      next(error);
    }
  };
};

export const validateParams = (schema: z.ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = await schema.parseAsync(req.params);
      req.params = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const validationErrors: ValidationError[] = error.errors.map((err) => ({
          field: err.path.join("."),
          message: err.message,
          code: err.code,
        }));

        const response: ApiResponse = {
          success: false,
          message: "Parameter validation failed",
          errors: validationErrors,
        };

        return res.status(400).json(response);
      }
      next(error);
    }
  };
};
