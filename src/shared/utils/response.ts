import { Response } from "express";
import { ApiResponse, PaginationMeta, ValidationError } from "@/shared/types/common.types";

// Success response utilities
export const sendSuccess = <T = any>(
  res: Response,
  data?: T,
  message: string = "Success",
  statusCode: number = 200,
  meta?: PaginationMeta
): void => {
  const response: ApiResponse<T> = {
    success: true,
    data,
    message,
    ...(meta && { meta }),
  };

  res.status(statusCode).json(response);
};

export const sendCreated = <T = any>(
  res: Response,
  data: T,
  message: string = "Resource created successfully"
): void => {
  sendSuccess(res, data, message, 201);
};

export const sendUpdated = <T = any>(
  res: Response,
  data: T,
  message: string = "Resource updated successfully"
): void => {
  sendSuccess(res, data, message, 200);
};

export const sendDeleted = (res: Response, message: string = "Resource deleted successfully"): void => {
  sendSuccess(res, undefined, message, 200);
};

// Error response utilities
export const sendError = (
  res: Response,
  message: string,
  statusCode: number = 400,
  errors?: ValidationError[],
  code?: string
): void => {
  const response: ApiResponse = {
    success: false,
    message,
    ...(errors && errors.length > 0 && { errors }),
    ...(code && { code }),
  };

  res.status(statusCode).json(response);
};

export const sendValidationError = (
  res: Response,
  errors: ValidationError[],
  message: string = "Validation failed"
): void => {
  sendError(res, message, 400, errors, "VALIDATION_ERROR");
};

export const sendUnauthorized = (res: Response, message: string = "Unauthorized"): void => {
  sendError(res, message, 401, undefined, "UNAUTHORIZED");
};

export const sendForbidden = (res: Response, message: string = "Forbidden"): void => {
  sendError(res, message, 403, undefined, "FORBIDDEN");
};

export const sendNotFound = (res: Response, message: string = "Resource not found"): void => {
  sendError(res, message, 404, undefined, "NOT_FOUND");
};

export const sendConflict = (
  res: Response,
  message: string = "Resource conflict",
  errors?: ValidationError[]
): void => {
  sendError(res, message, 409, errors, "CONFLICT");
};

export const sendTooManyRequests = (res: Response, message: string = "Too many requests"): void => {
  sendError(res, message, 429, undefined, "RATE_LIMIT_EXCEEDED");
};

export const sendInternalError = (res: Response, message: string = "Internal server error"): void => {
  sendError(res, message, 500, undefined, "INTERNAL_ERROR");
};

// Pagination utilities
export const sendPaginatedResponse = <T = any>(
  res: Response,
  data: T[],
  page: number,
  limit: number,
  total: number,
  message: string = "Data retrieved successfully"
): void => {
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPreviousPage = page > 1;

  const meta: PaginationMeta = {
    page,
    limit,
    total,
    totalPages,
    hasNextPage,
    hasPreviousPage,
  };

  sendSuccess(res, data, message, 200, meta);
};

// Response transformation utilities
export const transformResponse = <T, U>(data: T, transformer: (item: T) => U): U => {
  return transformer(data);
};

export const transformArrayResponse = <T, U>(data: T[], transformer: (item: T) => U): U[] => {
  return data.map(transformer);
};

// Health check response
export const sendHealthCheck = (res: Response, data: any, message: string = "Service is healthy"): void => {
  sendSuccess(res, data, message, 200);
};

// Custom response with additional metadata
export const sendCustomResponse = <T = any>(
  res: Response,
  statusCode: number,
  success: boolean,
  message: string,
  data?: T,
  errors?: ValidationError[],
  meta?: any
): void => {
  const response: ApiResponse<T> = {
    success,
    message,
    ...(data !== undefined && { data }),
    ...(errors && errors.length > 0 && { errors }),
    ...(meta && { meta }),
  };

  res.status(statusCode).json(response);
};
