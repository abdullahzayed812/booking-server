import { Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";
import { ApiResponse, IValidationError, ValidationError } from "@/shared/types/common.types";
import { createModuleLogger } from "@/shared/config/logger";

const moduleLogger = createModuleLogger("ValidationMiddleware");

const formatZodErrors = (error: ZodError): IValidationError[] => {
  // Ensure error.errors exists and is an array
  if (!(error as any).errors || !Array.isArray((error as any).errors)) {
    return [
      {
        field: "unknown",
        message: "Validation failed",
        code: "invalid_input",
      },
    ];
  }

  return (error as any).errors.map((err: any) => ({
    field: err.path ? err.path.join(".") : "unknown",
    message: err.message || "Invalid input",
    code: err.code || "invalid_input",
  }));
};

export const validateBody = (schema: z.ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = await schema.parseAsync(req.body);
      req.body = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const validationErrors: IValidationError[] = formatZodErrors(error);

        const response: ApiResponse = {
          success: false,
          message: "Request validation failed",
          errors: validationErrors,
        };

        moduleLogger.warn(
          {
            path: req.path,
            method: req.method,
            errors: validationErrors,
            correlationId: req.correlationId,
          },
          "Body validation failed:"
        );

        return res.status(400).json(response);
      }
      next(error);
    }
  };
};

export const validateQuery = (schema: z.ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = await schema.parseAsync(req.query);
      // req.query = validated as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const validationErrors: IValidationError[] = formatZodErrors(error);

        const response: ApiResponse = {
          success: false,
          message: "Query validation failed",
          errors: validationErrors,
        };

        moduleLogger.warn(
          {
            path: req.path,
            method: req.method,
            errors: validationErrors,
            correlationId: req.correlationId,
          },
          "Query validation failed:"
        );

        return res.status(400).json(response);
      }
      next(error);
    }
  };
};

export const validateParams = (schema: z.ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = await schema.parseAsync(req.params);
      req.params = validated as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const validationErrors: IValidationError[] = formatZodErrors(error);

        const response: ApiResponse = {
          success: false,
          message: "Parameter validation failed",
          errors: validationErrors,
        };

        moduleLogger.warn(
          {
            path: req.path,
            method: req.method,
            errors: validationErrors,
            correlationId: req.correlationId,
          },
          "Parameter validation failed:"
        );

        return res.status(400).json(response);
      }
      next(error);
    }
  };
};
