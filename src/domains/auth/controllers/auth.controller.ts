import { Request, Response, NextFunction } from "express";
// import { createModuleLogger } from "@/shared/config/logger";
import { ApiResponse } from "@/shared/types/common.types";
import { AuthResponse, RegisterRequest, LoginRequest, ChangePasswordRequest } from "@/shared/types/auth.types";
import { AuthService } from "../services/auth.service";
import { UserRepository } from "../repositories/user.repository";

// const moduleLogger = createModuleLogger("AuthController");

export class AuthController {
  private authService: AuthService;

  constructor() {
    const userRepository = new UserRepository();
    this.authService = new AuthService(userRepository);
  }

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const registerData: RegisterRequest = req.validatedBody;
      const tenantId = req.tenantId!;

      const authResponse = await this.authService.register(registerData, tenantId);

      const response: ApiResponse<AuthResponse> = {
        success: true,
        data: authResponse,
        message: "User registered successfully",
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const loginData: LoginRequest = req.validatedBody;
      const tenantId = req.tenantId!;

      // Collect metadata for security logging
      const metadata = {
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get("User-Agent"),
        correlationId: req.correlationId,
      };

      const authResponse = await this.authService.login(loginData, tenantId, metadata);

      const response: ApiResponse<AuthResponse> = {
        success: true,
        data: authResponse,
        message: "Login successful",
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  refreshToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.validatedBody;

      const authResponse = await this.authService.refreshToken(refreshToken);

      const response: ApiResponse<AuthResponse> = {
        success: true,
        data: authResponse,
        message: "Token refreshed successfully",
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const sessionId = req.sessionId!;
      const accessToken = req.headers.authorization?.split(" ")[1] || "";

      await this.authService.logout(userId, sessionId, accessToken);

      const response: ApiResponse = {
        success: true,
        message: "Logout successful",
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  getCurrentUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;

      const response: ApiResponse = {
        success: true,
        data: user,
        message: "User profile retrieved successfully",
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  changePassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const tenantId = req.user!.tenantId;
      const passwordData: ChangePasswordRequest = req.validatedBody;

      await this.authService.changePassword(userId, passwordData, tenantId);

      const response: ApiResponse = {
        success: true,
        message: "Password changed successfully",
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  getUserSessions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const tenantId = req.user!.tenantId;

      const sessions = await this.authService.getUserSessions(userId, tenantId);

      const response: ApiResponse = {
        success: true,
        data: sessions,
        message: "Sessions retrieved successfully",
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  revokeSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const tenantId = req.user!.tenantId;
      const { sessionId } = req.validatedParams;

      await this.authService.revokeSession(userId, sessionId, tenantId);

      const response: ApiResponse = {
        success: true,
        message: "Session revoked successfully",
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  validateToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // If we reach here, the token is valid (middleware already validated it)
      const user = req.user!;

      const response: ApiResponse = {
        success: true,
        data: {
          valid: true,
          user,
        },
        message: "Token is valid",
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  healthCheck = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const response: ApiResponse = {
        success: true,
        data: {
          service: "auth",
          status: "healthy",
          timestamp: new Date(),
        },
        message: "Authentication service is healthy",
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };
}
