import { createModuleLogger } from "@/shared/config/logger";
import { NotFoundError, ValidationError, ForbiddenError } from "@/shared/types/common.types";
import { eventBus, EventTypes } from "@/shared/events/event-bus";
import { MedicalNoteRepository } from "../repositories/medical-note.repository";
import {
  MedicalNoteEntity,
  MedicalNoteWithDetails,
  CreateMedicalNoteData,
  UpdateMedicalNoteData,
} from "../models/medical-note.model";

const moduleLogger = createModuleLogger("MedicalNoteService");

export interface CreateMedicalNoteRequest {
  appointmentId: string;
  chiefComplaint?: string;
  diagnosis?: string;
  treatmentPlan?: string;
  medications?: string;
  followUpInstructions?: string;
  nextAppointmentRecommended?: boolean;
  isConfidential?: boolean;
}

export interface UpdateMedicalNoteRequest {
  chiefComplaint?: string;
  diagnosis?: string;
  treatmentPlan?: string;
  medications?: string;
  followUpInstructions?: string;
  nextAppointmentRecommended?: boolean;
  isConfidential?: boolean;
}

export interface MedicalNoteFilters {
  patientId?: string;
  doctorId?: string;
  startDate?: string;
  endDate?: string;
  includeConfidential?: boolean;
  limit?: number;
  offset?: number;
}

export class MedicalNoteService {
  constructor(private medicalNoteRepository: MedicalNoteRepository) {}

  async createMedicalNote(
    request: CreateMedicalNoteRequest,
    tenantId: string,
    doctorId: string,
    patientId: string
  ): Promise<MedicalNoteWithDetails> {
    try {
      // Validate input
      this.validateCreateMedicalNoteRequest(request);

      // Create medical note data
      const noteData: CreateMedicalNoteData = {
        tenantId,
        appointmentId: request.appointmentId,
        doctorId,
        patientId,
        chiefComplaint: request.chiefComplaint?.trim(),
        diagnosis: request.diagnosis?.trim(),
        treatmentPlan: request.treatmentPlan?.trim(),
        medications: request.medications?.trim(),
        followUpInstructions: request.followUpInstructions?.trim(),
        nextAppointmentRecommended: request.nextAppointmentRecommended || false,
        isConfidential: request.isConfidential || false,
      };

      // Create medical note
      const note = await this.medicalNoteRepository.create(noteData);

      // Get note with details
      const noteWithDetails = await this.medicalNoteRepository.findWithDetails(note.id, tenantId);
      if (!noteWithDetails) {
        throw new Error("Failed to retrieve created medical note");
      }

      // Publish domain event
      const noteCreatedEvent = eventBus.createEvent(
        EventTypes.MEDICAL_NOTE_CREATED,
        tenantId,
        note.id,
        "medical_note",
        {
          noteId: note.id,
          appointmentId: request.appointmentId,
          doctorId,
          patientId,
          hasConfidentialData: noteData.isConfidential,
        },
        1,
        doctorId
      );

      await eventBus.publish(noteCreatedEvent);

      moduleLogger.info(
        {
          noteId: note.id,
          appointmentId: request.appointmentId,
          doctorId,
          patientId,
          tenantId,
        },
        "Medical note created successfully"
      );

      return noteWithDetails;
    } catch (error: any) {
      moduleLogger.error("Error creating medical note:", error);
      throw error;
    }
  }

  async updateMedicalNote(
    noteId: string,
    request: UpdateMedicalNoteRequest,
    tenantId: string,
    userId: string,
    userRole: string
  ): Promise<MedicalNoteWithDetails> {
    try {
      // Get existing note
      const existingNote = await this.medicalNoteRepository.findById(noteId, tenantId);
      if (!existingNote) {
        throw new NotFoundError("Medical note not found");
      }

      // Check permissions
      if (!existingNote.canBeEditedBy(userId, userRole)) {
        throw new ForbiddenError("You do not have permission to edit this medical note");
      }

      // Validate input
      this.validateUpdateMedicalNoteRequest(request);

      // Prepare update data
      const updateData: UpdateMedicalNoteData = {};

      if (request.chiefComplaint !== undefined) {
        updateData.chiefComplaint = request.chiefComplaint?.trim();
      }
      if (request.diagnosis !== undefined) {
        updateData.diagnosis = request.diagnosis?.trim();
      }
      if (request.treatmentPlan !== undefined) {
        updateData.treatmentPlan = request.treatmentPlan?.trim();
      }
      if (request.medications !== undefined) {
        updateData.medications = request.medications?.trim();
      }
      if (request.followUpInstructions !== undefined) {
        updateData.followUpInstructions = request.followUpInstructions?.trim();
      }
      if (request.nextAppointmentRecommended !== undefined) {
        updateData.nextAppointmentRecommended = request.nextAppointmentRecommended;
      }
      if (request.isConfidential !== undefined) {
        updateData.isConfidential = request.isConfidential;
      }

      // Update medical note
      const updatedNote = await this.medicalNoteRepository.update(noteId, updateData, tenantId);

      // Get updated note with details
      const noteWithDetails = await this.medicalNoteRepository.findWithDetails(noteId, tenantId);
      if (!noteWithDetails) {
        throw new Error("Failed to retrieve updated medical note");
      }

      // Publish domain event
      const noteUpdatedEvent = eventBus.createEvent(
        EventTypes.MEDICAL_NOTE_UPDATED,
        tenantId,
        noteId,
        "medical_note",
        {
          noteId,
          appointmentId: existingNote.appointmentId,
          doctorId: existingNote.doctorId,
          patientId: existingNote.patientId,
          changes: updateData,
        },
        1,
        userId
      );

      await eventBus.publish(noteUpdatedEvent);

      moduleLogger.info(
        {
          noteId,
          tenantId,
          updatedBy: userId,
          changes: Object.keys(updateData),
        },
        "Medical note updated successfully"
      );

      return noteWithDetails;
    } catch (error: any) {
      moduleLogger.error("Error updating medical note:", error);
      throw error;
    }
  }

  async getMedicalNote(
    noteId: string,
    tenantId: string,
    userId: string,
    userRole: string
  ): Promise<MedicalNoteWithDetails | null> {
    try {
      const noteWithDetails = await this.medicalNoteRepository.findWithDetails(noteId, tenantId);
      if (!noteWithDetails) {
        return null;
      }

      // Check permissions
      const noteEntity = MedicalNoteEntity.fromDatabase(noteWithDetails);
      if (!noteEntity.canBeViewedBy(userId, userRole)) {
        throw new ForbiddenError("You do not have permission to view this medical note");
      }

      return noteWithDetails;
    } catch (error: any) {
      moduleLogger.error("Error getting medical note:", error);
      throw error;
    }
  }

  async getMedicalNoteByAppointment(
    appointmentId: string,
    tenantId: string,
    userId: string,
    userRole: string
  ): Promise<MedicalNoteWithDetails | null> {
    try {
      const note = await this.medicalNoteRepository.findByAppointmentId(appointmentId, tenantId);
      if (!note) {
        return null;
      }

      return await this.getMedicalNote(note.id, tenantId, userId, userRole);
    } catch (error: any) {
      moduleLogger.error("Error getting medical note by appointment:", error);
      throw error;
    }
  }

  async getMedicalNotes(
    filters: MedicalNoteFilters,
    tenantId: string,
    userId: string,
    userRole: string
  ): Promise<{ notes: MedicalNoteWithDetails[]; total: number }> {
    try {
      let notes: MedicalNoteWithDetails[] = [];

      const options = {
        startDate: filters.startDate ? new Date(filters.startDate) : undefined,
        endDate: filters.endDate ? new Date(filters.endDate) : undefined,
        includeConfidential: filters.includeConfidential,
        limit: filters.limit || 50,
        offset: filters.offset || 0,
      };

      if (filters.patientId) {
        // For patient notes, only show non-confidential unless user has permission
        const includeConfidential =
          userRole === "admin" ||
          userRole === "doctor" ||
          (userRole === "patient" && filters.patientId === userId && filters.includeConfidential);

        notes = await this.medicalNoteRepository.findByPatient(filters.patientId, tenantId, {
          ...options,
          includeConfidential,
        });
      } else if (filters.doctorId) {
        notes = await this.medicalNoteRepository.findByDoctor(filters.doctorId, tenantId, options);
      } else if (userRole === "admin") {
        // Admin can see all notes - implement a general search method
        notes = []; // Would need to implement findAll method
      } else if (userRole === "doctor") {
        // Doctor sees their own notes
        notes = await this.medicalNoteRepository.findByDoctor(userId, tenantId, options);
      } else if (userRole === "patient") {
        // Patient sees their own notes (non-confidential by default)
        notes = await this.medicalNoteRepository.findByPatient(userId, tenantId, {
          ...options,
          includeConfidential: false,
        });
      }

      // Filter notes based on user permissions
      const filteredNotes = notes.filter((note) => {
        const noteEntity = MedicalNoteEntity.fromDatabase(note);
        return noteEntity.canBeViewedBy(userId, userRole);
      });

      return {
        notes: filteredNotes,
        total: filteredNotes.length, // This should be a separate count query in production
      };
    } catch (error: any) {
      moduleLogger.error("Error getting medical notes:", error);
      throw error;
    }
  }

  async searchMedicalNotes(
    searchTerm: string,
    tenantId: string,
    userId: string,
    userRole: string,
    filters?: {
      doctorId?: string;
      patientId?: string;
      includeConfidential?: boolean;
      limit?: number;
    }
  ): Promise<MedicalNoteWithDetails[]> {
    try {
      if (!searchTerm || searchTerm.trim().length < 3) {
        throw new ValidationError("Search term must be at least 3 characters long");
      }

      // Determine confidential access
      let includeConfidential = false;
      if (userRole === "admin") {
        includeConfidential = filters?.includeConfidential || false;
      } else if (userRole === "doctor") {
        includeConfidential = true; // Doctors can see their confidential notes
      }

      const notes = await this.medicalNoteRepository.searchNotes(searchTerm.trim(), tenantId, {
        doctorId: userRole === "doctor" && !filters?.doctorId ? userId : filters?.doctorId,
        patientId: userRole === "patient" && !filters?.patientId ? userId : filters?.patientId,
        includeConfidential,
        limit: filters?.limit || 20,
      });

      // Additional permission filtering
      return notes.filter((note) => {
        const noteEntity = MedicalNoteEntity.fromDatabase(note);
        return noteEntity.canBeViewedBy(userId, userRole);
      });
    } catch (error: any) {
      moduleLogger.error("Error searching medical notes:", error);
      throw error;
    }
  }

  async deleteMedicalNote(noteId: string, tenantId: string, userId: string, userRole: string): Promise<void> {
    try {
      const note = await this.medicalNoteRepository.findById(noteId, tenantId);
      if (!note) {
        throw new NotFoundError("Medical note not found");
      }

      // Check permissions
      if (!note.canBeEditedBy(userId, userRole)) {
        throw new ForbiddenError("You do not have permission to delete this medical note");
      }

      await this.medicalNoteRepository.delete(noteId, tenantId);

      moduleLogger.info(
        {
          noteId,
          tenantId,
          deletedBy: userId,
        },
        "Medical note deleted successfully"
      );
    } catch (error: any) {
      moduleLogger.error("Error deleting medical note:", error);
      throw error;
    }
  }

  async getMedicalNoteStats(tenantId: string): Promise<any> {
    try {
      return await this.medicalNoteRepository.getStats(tenantId);
    } catch (error: any) {
      moduleLogger.error("Error getting medical note stats:", error);
      throw error;
    }
  }

  // Private validation methods
  private validateCreateMedicalNoteRequest(request: CreateMedicalNoteRequest): void {
    if (!request.appointmentId) {
      throw new ValidationError("Appointment ID is required");
    }

    if (request.chiefComplaint && request.chiefComplaint.length > 2000) {
      throw new ValidationError("Chief complaint cannot exceed 2000 characters");
    }

    if (request.diagnosis && request.diagnosis.length > 2000) {
      throw new ValidationError("Diagnosis cannot exceed 2000 characters");
    }

    if (request.treatmentPlan && request.treatmentPlan.length > 5000) {
      throw new ValidationError("Treatment plan cannot exceed 5000 characters");
    }

    if (request.medications && request.medications.length > 2000) {
      throw new ValidationError("Medications cannot exceed 2000 characters");
    }

    if (request.followUpInstructions && request.followUpInstructions.length > 3000) {
      throw new ValidationError("Follow-up instructions cannot exceed 3000 characters");
    }
  }

  private validateUpdateMedicalNoteRequest(request: UpdateMedicalNoteRequest): void {
    if (request.chiefComplaint !== undefined && request.chiefComplaint && request.chiefComplaint.length > 2000) {
      throw new ValidationError("Chief complaint cannot exceed 2000 characters");
    }

    if (request.diagnosis !== undefined && request.diagnosis && request.diagnosis.length > 2000) {
      throw new ValidationError("Diagnosis cannot exceed 2000 characters");
    }

    if (request.treatmentPlan !== undefined && request.treatmentPlan && request.treatmentPlan.length > 5000) {
      throw new ValidationError("Treatment plan cannot exceed 5000 characters");
    }

    if (request.medications !== undefined && request.medications && request.medications.length > 2000) {
      throw new ValidationError("Medications cannot exceed 2000 characters");
    }

    if (
      request.followUpInstructions !== undefined &&
      request.followUpInstructions &&
      request.followUpInstructions.length > 3000
    ) {
      throw new ValidationError("Follow-up instructions cannot exceed 3000 characters");
    }
  }
}
