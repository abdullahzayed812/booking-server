import { Request, Response, NextFunction } from "express";
// import { createModuleLogger } from "@/shared/config/logger";
import { sendSuccess, sendCreated, sendError, sendPaginatedResponse } from "@/shared/utils/response";
import {
  DoctorService,
  CreateDoctorProfileRequest,
  UpdateDoctorProfileRequest,
  WeeklyScheduleSlot,
  AvailabilityOverrideRequest,
} from "../services/doctor.service";
import { DoctorRepository } from "../repositories/doctor.repository";
import { AvailabilityRepository } from "../repositories/availability.repository";

// const moduleLogger = createModuleLogger("DoctorController");

export class DoctorController {
  private doctorService: DoctorService;

  constructor() {
    const doctorRepository = new DoctorRepository();
    const availabilityRepository = new AvailabilityRepository();
    this.doctorService = new DoctorService(doctorRepository, availabilityRepository);
  }

  createDoctorProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const profileData: CreateDoctorProfileRequest = req.body;
      const tenantId = req.tenantId!;
      const createdBy = req.user!.id;

      const doctor = await this.doctorService.createDoctorProfile(profileData, tenantId, createdBy);

      sendCreated(res, doctor, "Doctor profile created successfully");
    } catch (error) {
      next(error);
    }
  };

  getDoctors = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenantId!;

      const filters = {
        specialization: req.query["specialization"] as string,
        isAcceptingAppointments: req.query["isAcceptingAppointments"] === "true",
        isActive: req.query["isActive"] !== "false", // Default to true
        limit: parseInt(req.query["limit"] as string) || 20,
        offset: ((parseInt(req.query["page"] as string) || 1) - 1) * (parseInt(req.query["limit"] as string) || 20),
      };

      const result = await this.doctorService.getDoctors(tenantId, filters);

      const page = parseInt(req.query["page"] as string) || 1;
      const limit = parseInt(req.query["limit"] as string) || 20;

      sendPaginatedResponse(res, result.doctors, page, limit, result.total, "Doctors retrieved successfully");
    } catch (error) {
      next(error);
    }
  };

  getDoctorProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;

      if (!id) {
        return sendError(res, "Doctor not found", 404);
      }

      const doctor = await this.doctorService.getDoctorProfile(id, tenantId);

      if (!doctor) {
        return sendError(res, "Doctor not found", 404);
      }

      sendSuccess(res, doctor, "Doctor profile retrieved successfully");
    } catch (error) {
      next(error);
    }
  };

  updateDoctorProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const updateData: UpdateDoctorProfileRequest = req.body;
      const tenantId = req.tenantId!;
      const updatedBy = req.user!.id;

      if (!id) {
        return sendError(res, "Doctor not found", 404);
      }

      const doctor = await this.doctorService.updateDoctorProfile(id, updateData, tenantId, updatedBy);

      sendSuccess(res, doctor, "Doctor profile updated successfully");
    } catch (error) {
      next(error);
    }
  };

  toggleAcceptingAppointments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;
      const updatedBy = req.user!.id;

      if (!id) {
        return sendError(res, "Doctor not found", 404);
      }

      const doctor = await this.doctorService.toggleAcceptingAppointments(id, tenantId, updatedBy);

      sendSuccess(
        res,
        {
          doctorId: id,
          isAcceptingAppointments: doctor.isAcceptingAppointments,
        },
        `Doctor is now ${doctor.isAcceptingAppointments ? "accepting" : "not accepting"} appointments`
      );
    } catch (error) {
      next(error);
    }
  };

  getSpecializations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenantId!;

      const specializations = await this.doctorService.getSpecializations(tenantId);

      sendSuccess(res, { specializations }, "Specializations retrieved successfully");
    } catch (error) {
      next(error);
    }
  };

  getDoctorsBySpecialization = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { specialization } = req.params;
      const tenantId = req.tenantId!;
      const limit = parseInt(req.query["limit"] as string) || 50;

      if (!specialization) {
        return sendError(res, "Specialization not found", 404);
      }

      const doctors = await this.doctorService.getDoctorsBySpecialization(
        decodeURIComponent(specialization),
        tenantId,
        limit
      );

      sendSuccess(res, { doctors, specialization }, "Doctors retrieved successfully");
    } catch (error) {
      next(error);
    }
  };

  // Availability management endpoints

  getDoctorAvailability = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;

      if (!id) {
        return sendError(res, "Doctor not found", 404);
      }

      const availability = await this.doctorService.getDoctorAvailability(id, tenantId);

      sendSuccess(res, { availability }, "Doctor availability retrieved successfully");
    } catch (error) {
      next(error);
    }
  };

  setWeeklySchedule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { schedule }: { schedule: WeeklyScheduleSlot[] } = req.body;
      const tenantId = req.tenantId!;
      const updatedBy = req.user!.id;

      if (!id) {
        return sendError(res, "Doctor not found", 404);
      }

      await this.doctorService.setWeeklySchedule(id, schedule, tenantId, updatedBy);

      sendSuccess(res, undefined, "Weekly schedule updated successfully");
    } catch (error) {
      next(error);
    }
  };

  getAvailabilityOverrides = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { startDate, endDate } = req.query;
      const tenantId = req.tenantId!;

      if (!id) {
        return sendError(res, "Doctor not found", 404);
      }

      const overrides = await this.doctorService.getAvailabilityOverrides(
        id,
        new Date(startDate as string),
        new Date(endDate as string),
        tenantId
      );

      sendSuccess(res, { overrides }, "Availability overrides retrieved successfully");
    } catch (error) {
      next(error);
    }
  };

  createAvailabilityOverride = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const overrideData: AvailabilityOverrideRequest = req.body;
      const tenantId = req.tenantId!;
      const createdBy = req.user!.id;

      if (!id) {
        return sendError(res, "Doctor not found", 404);
      }

      const override = await this.doctorService.createAvailabilityOverride(id, overrideData, tenantId, createdBy);

      sendCreated(res, override, "Availability override created successfully");
    } catch (error) {
      next(error);
    }
  };

  deleteAvailabilityOverride = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { overrideId } = req.params;
      const tenantId = req.tenantId!;
      const deletedBy = req.user!.id;

      if (!overrideId) {
        return sendError(res, "Override ID not found", 404);
      }

      await this.doctorService.deleteAvailabilityOverride(overrideId, tenantId, deletedBy);

      sendSuccess(res, undefined, "Availability override deleted successfully");
    } catch (error) {
      next(error);
    }
  };

  getDoctorStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenantId!;

      const stats = await this.doctorService.getDoctorStats(tenantId);

      sendSuccess(res, stats, "Doctor statistics retrieved successfully");
    } catch (error) {
      next(error);
    }
  };

  /**
   * Health check for doctors service
   */
  healthCheck = async (req: Request, res: Response): Promise<void> => {
    sendSuccess(
      res,
      {
        service: "doctors",
        status: "healthy",
        timestamp: new Date(),
      },
      "Doctors service is healthy"
    );
  };
}
