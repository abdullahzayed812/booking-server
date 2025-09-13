import { Request, Response, NextFunction } from "express";
import { sendSuccess, sendCreated, sendError, sendPaginatedResponse } from "@/shared/utils/response";
import {
  MedicalNoteService,
  CreateMedicalNoteRequest,
  UpdateMedicalNoteRequest,
  MedicalNoteFilters,
} from "../services/medical-note.service";
import { MedicalNoteRepository } from "../repositories/medical-note.repository";

export class MedicalNoteController {
  private medicalNoteService: MedicalNoteService;

  constructor() {
    const medicalNoteRepository = new MedicalNoteRepository();
    this.medicalNoteService = new MedicalNoteService(medicalNoteRepository);
  }

  createMedicalNote = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const noteData: CreateMedicalNoteRequest = req.body;
      const tenantId = req.tenantId!;
      const doctorId = req.user!.id;
      const { patientId } = req.body;

      const note = await this.medicalNoteService.createMedicalNote(noteData, tenantId, doctorId, patientId);

      sendCreated(res, note, "Medical note created successfully");
    } catch (error) {
      next(error);
    }
  };

  getMedicalNotes = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const filters: MedicalNoteFilters = {
        patientId: req.query["patientId"] as string,
        doctorId: req.query["doctorId"] as string,
        startDate: req.query["startDate"] as string,
        endDate: req.query["endDate"] as string,
        includeConfidential: req.query["includeConfidential"] === "true",
        limit: parseInt(req.query["limit"] as string) || 50,
        offset: ((parseInt(req.query["page"] as string) || 1) - 1) * (parseInt(req.query["limit"] as string) || 50),
      };

      const result = await this.medicalNoteService.getMedicalNotes(filters, tenantId, userId, userRole);

      const page = parseInt(req.query["page"] as string) || 1;
      const limit = parseInt(req.query["limit"] as string) || 50;

      sendPaginatedResponse(res, result.notes, page, limit, result.total, "Medical notes retrieved successfully");
    } catch (error) {
      next(error);
    }
  };

  getMedicalNote = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      if (!id) {
        return sendError(res, "Note ID not found.", 404);
      }

      const note = await this.medicalNoteService.getMedicalNote(id, tenantId, userId, userRole);

      if (!note) {
        return sendError(res, "Medical note not found", 404);
      }

      sendSuccess(res, note, "Medical note retrieved successfully");
    } catch (error) {
      next(error);
    }
  };

  getMedicalNoteByAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { appointmentId } = req.params;
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      if (!appointmentId) {
        return sendError(res, "Apppointment ID not found.", 404);
      }

      const note = await this.medicalNoteService.getMedicalNoteByAppointment(appointmentId, tenantId, userId, userRole);

      if (!note) {
        return sendError(res, "Medical note not found for this appointment", 404);
      }

      sendSuccess(res, note, "Medical note retrieved successfully");
    } catch (error) {
      next(error);
    }
  };

  updateMedicalNote = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const updateData: UpdateMedicalNoteRequest = req.body;
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      if (!id) {
        return sendError(res, "Note ID not found.", 404);
      }

      const note = await this.medicalNoteService.updateMedicalNote(id, updateData, tenantId, userId, userRole);

      sendSuccess(res, note, "Medical note updated successfully");
    } catch (error) {
      next(error);
    }
  };

  deleteMedicalNote = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      if (!id) {
        return sendError(res, "Apppointment ID not found.", 404);
      }

      await this.medicalNoteService.deleteMedicalNote(id, tenantId, userId, userRole);

      sendSuccess(res, undefined, "Medical note deleted successfully");
    } catch (error) {
      next(error);
    }
  };

  searchMedicalNotes = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { q } = req.query;
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const filters = {
        doctorId: req.query["doctorId"] as string,
        patientId: req.query["patientId"] as string,
        includeConfidential: req.query["includeConfidential"] === "true",
        limit: parseInt(req.query["limit"] as string) || 20,
      };

      const notes = await this.medicalNoteService.searchMedicalNotes(q as string, tenantId, userId, userRole, filters);

      sendSuccess(res, { notes, query: q, count: notes.length }, "Search results retrieved successfully");
    } catch (error) {
      next(error);
    }
  };

  getMedicalNoteStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenantId!;

      const stats = await this.medicalNoteService.getMedicalNoteStats(tenantId);

      sendSuccess(res, stats, "Medical note statistics retrieved successfully");
    } catch (error) {
      next(error);
    }
  };

  healthCheck = async (req: Request, res: Response): Promise<void> => {
    sendSuccess(
      res,
      {
        service: "medical-notes",
        status: "healthy",
        timestamp: new Date(),
      },
      "Medical notes service is healthy"
    );
  };
}
