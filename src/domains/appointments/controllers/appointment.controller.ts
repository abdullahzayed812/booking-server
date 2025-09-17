import { Request, Response, NextFunction } from "express";
// import { createModuleLogger } from "@/shared/config/logger";
// import { ApiResponse, PaginationMeta } from "@/shared/types/common.types";
import { sendSuccess, sendCreated, sendError, sendPaginatedResponse } from "@/shared/utils/response";
import {
  AppointmentService,
  CreateAppointmentRequest,
  UpdateAppointmentRequest,
  AppointmentFilters,
} from "../services/appointment.service";
import { ConflictCheckerService } from "../services/conflict-checker.service";
import { AppointmentRepository } from "../repositories/appointment.repository";

// const moduleLogger = createModuleLogger("AppointmentController");

export class AppointmentController {
  private appointmentService: AppointmentService;
  private conflictChecker: ConflictCheckerService;

  constructor() {
    const appointmentRepository = new AppointmentRepository();
    this.conflictChecker = new ConflictCheckerService(appointmentRepository);
    this.appointmentService = new AppointmentService(appointmentRepository, this.conflictChecker);
  }

  createAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const appointmentData: CreateAppointmentRequest = req.body;
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const appointment = await this.appointmentService.createAppointment(appointmentData, tenantId, userId, userRole);

      sendCreated(res, appointment, "Appointment created successfully");
    } catch (error) {
      next(error);
    }
  };

  getAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;

      if (!id) {
        return sendError(res, "Missing appointment ID", 400);
      }

      const appointment = await this.appointmentService.getAppointment(id, tenantId);

      if (!appointment) {
        return sendError(res, "Appointment not found", 404);
      }

      sendSuccess(res, appointment, "Appointment retrieved successfully");
    } catch (error) {
      next(error);
    }
  };

  getAppointments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const filters: AppointmentFilters = {
        doctorId: req.query["doctorId"] as string,
        patientId: req.query["patientId"] as string,
        status: req.query["status"] as any,
        startDate: req.query["startDate"] as string,
        endDate: req.query["endDate"] as string,
        limit: parseInt(req.query["limit"] as string) || 20,
        offset: ((parseInt(req.query["page"] as string) || 1) - 1) * (parseInt(req.query["limit"] as string) || 20),
      };

      // Role-based filtering
      if (userRole === "doctor") {
        filters.doctorId = userId;
      } else if (userRole === "patient") {
        filters.patientId = userId;
      }

      const result = await this.appointmentService.getAppointments(filters, tenantId);

      const page = parseInt(req.query["page"] as string) || 1;
      const limit = parseInt(req.query["limit"] as string) || 20;

      sendPaginatedResponse(res, result.appointments, page, limit, result.total, "Appointments retrieved successfully");
    } catch (error) {
      next(error);
    }
  };

  updateAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const updateData: UpdateAppointmentRequest = req.body;
      const tenantId = req.tenantId!;
      const userId = req.user!.id;

      if (!id) {
        return sendError(res, "Missing appointment ID", 400);
      }

      const appointment = await this.appointmentService.updateAppointment(id, updateData, tenantId, userId);

      sendSuccess(res, appointment, "Appointment updated successfully");
    } catch (error) {
      next(error);
    }
  };

  cancelAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const tenantId = req.tenantId!;
      const userId = req.user!.id;

      if (!id) {
        return sendError(res, "Missing appointment ID", 400);
      }

      await this.appointmentService.cancelAppointment(id, reason, tenantId, userId);

      sendSuccess(res, undefined, "Appointment cancelled successfully");
    } catch (error) {
      next(error);
    }
  };

  confirmAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;
      const userId = req.user!.id;

      if (!id) {
        return sendError(res, "Missing appointment ID", 400);
      }

      await this.appointmentService.confirmAppointment(id, tenantId, userId);

      sendSuccess(res, undefined, "Appointment confirmed successfully");
    } catch (error) {
      next(error);
    }
  };

  getUpcomingAppointments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenantId!;
      const limit = parseInt(req.query["limit"] as string) || 10;

      const appointments = await this.appointmentService.getUpcomingAppointments(tenantId, limit);

      sendSuccess(res, appointments, "Upcoming appointments retrieved successfully");
    } catch (error) {
      next(error);
    }
  };

  getAvailableSlots = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { doctorId } = req.params;
      const { date, duration } = req.query;
      const tenantId = req.tenantId!;

      const appointmentDate = new Date(date as string);
      const slotDuration = parseInt(duration as string) || 30;

      if (!doctorId) {
        return sendError(res, "Missing doctor ID", 400);
      }

      const slots = await this.conflictChecker.findAvailableSlots(doctorId, appointmentDate, slotDuration, tenantId);

      sendSuccess(res, { slots, date, duration: slotDuration }, "Available slots retrieved successfully");
    } catch (error) {
      next(error);
    }
  };

  getNextAvailableSlot = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { doctorId } = req.params;
      const { startDate, duration, maxDays } = req.query;
      const tenantId = req.tenantId!;

      if (!doctorId) {
        return sendError(res, "Missing doctor ID", 400);
      }

      const searchStartDate = startDate ? new Date(startDate as string) : new Date();
      const slotDuration = parseInt(duration as string) || 30;
      const maxDaysToCheck = parseInt(maxDays as string) || 30;

      const nextSlot = await this.conflictChecker.getNextAvailableSlot(
        doctorId,
        searchStartDate,
        slotDuration,
        tenantId,
        maxDaysToCheck
      );

      if (!nextSlot) {
        return sendError(res, "No available slots found within the specified period", 404);
      }

      sendSuccess(res, nextSlot, "Next available slot found");
    } catch (error) {
      next(error);
    }
  };

  startAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;
      const userId = req.user!.id;

      if (!id) {
        return sendError(res, "Missing appointment ID", 400);
      }

      await this.appointmentService.updateAppointment(id, { status: "in_progress" } as any, tenantId, userId);

      sendSuccess(res, undefined, "Appointment started successfully");
    } catch (error) {
      next(error);
    }
  };

  completeAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      const tenantId = req.tenantId!;
      const userId = req.user!.id;

      if (!id) {
        return sendError(res, "Missing appointment ID", 400);
      }

      await this.appointmentService.updateAppointment(id, { status: "completed", notes } as any, tenantId, userId);

      sendSuccess(res, undefined, "Appointment completed successfully");
    } catch (error) {
      next(error);
    }
  };

  markNoShow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;
      const userId = req.user!.id;

      if (!id) {
        return sendError(res, "Missing appointment ID", 400);
      }

      await this.appointmentService.updateAppointment(id, { status: "no_show" } as any, tenantId, userId);

      sendSuccess(res, undefined, "Appointment marked as no-show");
    } catch (error) {
      next(error);
    }
  };

  getDashboardStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const stats = await this.appointmentService.getDashboardStats(tenantId, userId, userRole);

      sendSuccess(res, stats, "Dashboard stats retrieved successfully");
    } catch (error) {
      next(error);
    }
  };

  /**
   * Health check for appointments service
   */
  healthCheck = async (req: Request, res: Response): Promise<void> => {
    sendSuccess(
      res,
      {
        service: "appointments",
        status: "healthy",
        timestamp: new Date(),
      },
      "Appointments service is healthy"
    );
  };
}
