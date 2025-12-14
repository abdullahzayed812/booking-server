import { db } from "@/shared/config/database";
// import { redis } from '@/shared/config/redis';
import { createModuleLogger } from "@/shared/config/logger";
import { NotFoundError, ConflictError } from "@/shared/types/common.types";
import {
  MedicalNoteEntity,
  MedicalNoteWithDetails,
  CreateMedicalNoteData,
  UpdateMedicalNoteData,
} from "../models/medical-note.model";

const moduleLogger = createModuleLogger("MedicalNoteRepository");

export class MedicalNoteRepository {

  async create(noteData: CreateMedicalNoteData): Promise<MedicalNoteEntity> {
    try {
      // Check if note already exists for this appointment
      const existingNote = await this.findByAppointmentId(noteData.appointmentId, noteData.tenantId);
      if (existingNote) {
        throw new ConflictError("Medical note already exists for this appointment");
      }

      const noteEntity = MedicalNoteEntity.create(noteData);
      const dbData = noteEntity.toDatabaseFormat();

      const result = await db.query<{ insertId: string }>(
        `INSERT INTO medical_notes (
          tenant_id, appointment_id, doctor_id, patient_id, chief_complaint,
          diagnosis, treatment_plan, medications, follow_up_instructions,
          next_appointment_recommended, is_confidential
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          dbData.tenant_id,
          dbData.appointment_id,
          dbData.doctor_id,
          dbData.patient_id,
          dbData.chief_complaint,
          dbData.diagnosis,
          dbData.treatment_plan,
          dbData.medications,
          dbData.follow_up_instructions,
          dbData.next_appointment_recommended,
          dbData.is_confidential,
        ],
        noteData.tenantId
      );

      // Fetch the created note
      const createdNote = await this.findById(result[0]!.insertId, noteData.tenantId);
      if (!createdNote) {
        throw new Error("Failed to create medical note");
      }

      moduleLogger.info(
        {
          noteId: createdNote.id,
          appointmentId: noteData.appointmentId,
          doctorId: noteData.doctorId,
          tenantId: noteData.tenantId,
        },
        "Medical note created successfully"
      );

      return createdNote;
    } catch (error: any) {
      moduleLogger.error("Error creating medical note:", error);
      throw error;
    }
  }

  async findById(id: string, tenantId: string): Promise<MedicalNoteEntity | null> {
    try {
      const noteData = await db.queryOne(
        "SELECT * FROM medical_notes WHERE id = ? AND tenant_id = ?",
        [id, tenantId],
        tenantId
      );

      if (!noteData) {
        return null;
      }

      return MedicalNoteEntity.fromDatabase(noteData);
    } catch (error: any) {
      moduleLogger.error("Error finding medical note by ID:", error);
      throw error;
    }
  }

  async findByAppointmentId(appointmentId: string, tenantId: string): Promise<MedicalNoteEntity | null> {
    try {
      const noteData = await db.queryOne(
        "SELECT * FROM medical_notes WHERE appointment_id = ? AND tenant_id = ?",
        [appointmentId, tenantId],
        tenantId
      );

      if (!noteData) {
        return null;
      }

      return MedicalNoteEntity.fromDatabase(noteData);
    } catch (error: any) {
      moduleLogger.error("Error finding medical note by appointment ID:", error);
      throw error;
    }
  }

  async findWithDetails(id: string, tenantId: string): Promise<MedicalNoteWithDetails | null> {
    try {
      const noteData = await db.queryOne(
        `SELECT 
          mn.*,
          CONCAT(du.first_name, ' ', du.last_name) as doctor_name,
          CONCAT(pu.first_name, ' ', pu.last_name) as patient_name,
          a.appointment_date,
          a.start_time
        FROM medical_notes mn
        JOIN users du ON mn.doctor_id = du.id
        JOIN users pu ON mn.patient_id = pu.id
        JOIN appointments a ON mn.appointment_id = a.id
        WHERE mn.id = ? AND mn.tenant_id = ?`,
        [id, tenantId],
        tenantId
      );

      if (!noteData) {
        return null;
      }

      const note = MedicalNoteEntity.fromDatabase(noteData).toJSON();

      return {
        ...note,
        doctorName: noteData.doctor_name,
        patientName: noteData.patient_name,
        appointmentDate: new Date(noteData.appointment_date),
        appointmentTime: noteData.start_time,
      };
    } catch (error: any) {
      moduleLogger.error("Error finding medical note with details:", error);
      throw error;
    }
  }

  async findByPatient(
    patientId: string,
    tenantId: string,
    options?: {
      includeConfidential?: boolean;
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<MedicalNoteWithDetails[]> {
    try {
      let query = `
        SELECT 
          mn.*,
          CONCAT(du.first_name, ' ', du.last_name) as doctor_name,
          CONCAT(pu.first_name, ' ', pu.last_name) as patient_name,
          a.appointment_date,
          a.start_time
        FROM medical_notes mn
        JOIN users du ON mn.doctor_id = du.id
        JOIN users pu ON mn.patient_id = pu.id
        JOIN appointments a ON mn.appointment_id = a.id
        WHERE mn.patient_id = ? AND mn.tenant_id = ?
      `;

      const params: any[] = [patientId, tenantId];

      if (!options?.includeConfidential) {
        query += " AND mn.is_confidential = false";
      }

      if (options?.startDate) {
        query += " AND a.appointment_date >= ?";
        params.push(options.startDate);
      }

      if (options?.endDate) {
        query += " AND a.appointment_date <= ?";
        params.push(options.endDate);
      }

      query += " ORDER BY a.appointment_date DESC, a.start_time DESC";

      if (options?.limit) {
        query += " LIMIT ?";
        params.push(options.limit);

        if (options?.offset) {
          query += " OFFSET ?";
          params.push(options.offset);
        }
      }

      const notes = await db.query(query, params, tenantId);

      return notes.map((noteData) => {
        const note = MedicalNoteEntity.fromDatabase(noteData).toJSON();
        return {
          ...note,
          doctorName: noteData.doctor_name,
          patientName: noteData.patient_name,
          appointmentDate: new Date(noteData.appointment_date),
          appointmentTime: noteData.start_time,
        };
      });
    } catch (error: any) {
      moduleLogger.error("Error finding medical notes by patient:", error);
      throw error;
    }
  }

  async findByDoctor(
    doctorId: string,
    tenantId: string,
    options?: {
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<MedicalNoteWithDetails[]> {
    try {
      let query = `
        SELECT 
          mn.*,
          CONCAT(du.first_name, ' ', du.last_name) as doctor_name,
          CONCAT(pu.first_name, ' ', pu.last_name) as patient_name,
          a.appointment_date,
          a.start_time
        FROM medical_notes mn
        JOIN users du ON mn.doctor_id = du.id
        JOIN users pu ON mn.patient_id = pu.id
        JOIN appointments a ON mn.appointment_id = a.id
        WHERE mn.doctor_id = ? AND mn.tenant_id = ?
      `;

      const params: any[] = [doctorId, tenantId];

      if (options?.startDate) {
        query += " AND a.appointment_date >= ?";
        params.push(options.startDate);
      }

      if (options?.endDate) {
        query += " AND a.appointment_date <= ?";
        params.push(options.endDate);
      }

      query += " ORDER BY a.appointment_date DESC, a.start_time DESC";

      if (options?.limit) {
        query += " LIMIT ?";
        params.push(options.limit);

        if (options?.offset) {
          query += " OFFSET ?";
          params.push(options.offset);
        }
      }

      const notes = await db.query(query, params, tenantId);

      return notes.map((noteData) => {
        const note = MedicalNoteEntity.fromDatabase(noteData).toJSON();
        return {
          ...note,
          doctorName: noteData.doctor_name,
          patientName: noteData.patient_name,
          appointmentDate: new Date(noteData.appointment_date),
          appointmentTime: noteData.start_time,
        };
      });
    } catch (error: any) {
      moduleLogger.error("Error finding medical notes by doctor:", error);
      throw error;
    }
  }

  async update(id: string, updateData: UpdateMedicalNoteData, tenantId: string): Promise<MedicalNoteEntity> {
    try {
      const note = await this.findById(id, tenantId);
      if (!note) {
        throw new NotFoundError("Medical note not found");
      }

      note.updateContent(updateData);
      const dbData = note.toDatabaseFormat();

      await db.query(
        `UPDATE medical_notes SET 
          chief_complaint = ?, diagnosis = ?, treatment_plan = ?, 
          medications = ?, follow_up_instructions = ?, 
          next_appointment_recommended = ?, is_confidential = ?, 
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND tenant_id = ?`,
        [
          dbData.chief_complaint,
          dbData.diagnosis,
          dbData.treatment_plan,
          dbData.medications,
          dbData.follow_up_instructions,
          dbData.next_appointment_recommended,
          dbData.is_confidential,
          id,
          tenantId,
        ],
        tenantId
      );

      moduleLogger.info(
        {
          noteId: id,
          tenantId,
          updates: Object.keys(updateData),
        },
        "Medical note updated successfully"
      );

      return note;
    } catch (error: any) {
      moduleLogger.error("Error updating medical note:", error);
      throw error;
    }
  }

  async delete(id: string, tenantId: string): Promise<void> {
    try {
      const note = await this.findById(id, tenantId);
      if (!note) {
        throw new NotFoundError("Medical note not found");
      }

      await db.query("DELETE FROM medical_notes WHERE id = ? AND tenant_id = ?", [id, tenantId], tenantId);

      moduleLogger.info(
        {
          noteId: id,
          tenantId,
        },
        "Medical note deleted successfully"
      );
    } catch (error: any) {
      moduleLogger.error("Error deleting medical note:", error);
      throw error;
    }
  }

  async searchNotes(
    searchTerm: string,
    tenantId: string,
    options?: {
      doctorId?: string;
      patientId?: string;
      includeConfidential?: boolean;
      limit?: number;
    }
  ): Promise<MedicalNoteWithDetails[]> {
    try {
      let query = `
        SELECT 
          mn.*,
          CONCAT(du.first_name, ' ', du.last_name) as doctor_name,
          CONCAT(pu.first_name, ' ', pu.last_name) as patient_name,
          a.appointment_date,
          a.start_time
        FROM medical_notes mn
        JOIN users du ON mn.doctor_id = du.id
        JOIN users pu ON mn.patient_id = pu.id
        JOIN appointments a ON mn.appointment_id = a.id
        WHERE mn.tenant_id = ?
        AND (
          mn.chief_complaint LIKE ? OR
          mn.diagnosis LIKE ? OR
          mn.treatment_plan LIKE ? OR
          mn.medications LIKE ?
        )
      `;

      const searchPattern = `%${searchTerm}%`;
      const params: any[] = [tenantId, searchPattern, searchPattern, searchPattern, searchPattern];

      if (options?.doctorId) {
        query += " AND mn.doctor_id = ?";
        params.push(options.doctorId);
      }

      if (options?.patientId) {
        query += " AND mn.patient_id = ?";
        params.push(options.patientId);
      }

      if (!options?.includeConfidential) {
        query += " AND mn.is_confidential = false";
      }

      query += " ORDER BY a.appointment_date DESC LIMIT ?";
      params.push(options?.limit || 50);

      const notes = await db.query(query, params, tenantId);

      return notes.map((noteData) => {
        const note = MedicalNoteEntity.fromDatabase(noteData).toJSON();
        return {
          ...note,
          doctorName: noteData.doctor_name,
          patientName: noteData.patient_name,
          appointmentDate: new Date(noteData.appointment_date),
          appointmentTime: noteData.start_time,
        };
      });
    } catch (error: any) {
      moduleLogger.error("Error searching medical notes:", error);
      throw error;
    }
  }

  async getStats(tenantId: string): Promise<any> {
    try {
      const stats = await db.queryOne(
        `SELECT 
          COUNT(*) as total_notes,
          COUNT(CASE WHEN is_confidential = true THEN 1 END) as confidential_notes,
          COUNT(CASE WHEN next_appointment_recommended = true THEN 1 END) as follow_up_recommended,
          COUNT(CASE WHEN diagnosis IS NOT NULL AND diagnosis != '' THEN 1 END) as notes_with_diagnosis
        FROM medical_notes
        WHERE tenant_id = ?`,
        [tenantId],
        tenantId
      );

      return {
        totalNotes: parseInt(stats.total_notes),
        confidentialNotes: parseInt(stats.confidential_notes),
        followUpRecommended: parseInt(stats.follow_up_recommended),
        notesWithDiagnosis: parseInt(stats.notes_with_diagnosis),
      };
    } catch (error: any) {
      moduleLogger.error("Error getting medical notes stats:", error);
      throw error;
    }
  }
}
