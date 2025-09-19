import { z } from "zod";
import { AppointmentStatus } from "@/shared/types/common.types";

// Time validation schema
const timeSchema = z
  .string()
  .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Time must be in HH:mm format")
  .refine((time) => {
    const [hours, minutes] = time.split(":").map(Number);
    const totalMinutes = hours! * 60 + minutes!;
    return totalMinutes % 15 === 0;
  }, "Time must be on 15-minute boundaries");

// Date validation schema
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .refine((dateStr) => {
    const date = new Date(dateStr);
    return !isNaN(date.getTime());
  }, "Invalid date")
  .refine((dateStr) => {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date >= today;
  }, "Date cannot be in the past");

// UUID validation schema
const uuidSchema = z.string().uuid("Invalid UUID format");

// Create appointment validation schema
export const createAppointmentSchema = z
  .object({
    doctorId: uuidSchema,
    patientId: uuidSchema.optional(),
    appointmentDate: dateSchema,
    startTime: timeSchema,
    endTime: timeSchema,
    reasonForVisit: z.string().max(500, "Reason for visit cannot exceed 500 characters").optional(),
  })
  .refine(
    (data) => {
      const startMinutes = timeToMinutes(data.startTime);
      const endMinutes = timeToMinutes(data.endTime);
      return endMinutes > startMinutes;
    },
    {
      message: "End time must be after start time",
      path: ["endTime"],
    }
  )
  .refine(
    (data) => {
      const startMinutes = timeToMinutes(data.startTime);
      const endMinutes = timeToMinutes(data.endTime);
      const duration = endMinutes - startMinutes;
      return duration >= 15 && duration <= 240;
    },
    {
      message: "Appointment duration must be between 15 minutes and 4 hours",
      path: ["endTime"],
    }
  );

// Update appointment validation schema
export const updateAppointmentSchema = z
  .object({
    appointmentDate: dateSchema.optional(),
    startTime: timeSchema.optional(),
    endTime: timeSchema.optional(),
    reasonForVisit: z.string().max(500, "Reason for visit cannot exceed 500 characters").optional(),
    notes: z.string().max(2000, "Notes cannot exceed 2000 characters").optional(),
  })
  .refine(
    (data) => {
      // If both start and end time are provided, validate them together
      if (data.startTime && data.endTime) {
        const startMinutes = timeToMinutes(data.startTime);
        const endMinutes = timeToMinutes(data.endTime);
        return endMinutes > startMinutes;
      }
      return true;
    },
    {
      message: "End time must be after start time",
      path: ["endTime"],
    }
  );

// Cancel appointment validation schema
export const cancelAppointmentSchema = z.object({
  reason: z
    .string()
    .min(1, "Cancellation reason is required")
    .max(500, "Cancellation reason cannot exceed 500 characters"),
});

// Reschedule appointment validation schema
export const rescheduleAppointmentSchema = z
  .object({
    appointmentDate: dateSchema,
    startTime: timeSchema,
    endTime: timeSchema,
    reason: z.string().max(500, "Reschedule reason cannot exceed 500 characters").optional(),
  })
  .refine(
    (data) => {
      const startMinutes = timeToMinutes(data.startTime);
      const endMinutes = timeToMinutes(data.endTime);
      return endMinutes > startMinutes;
    },
    {
      message: "End time must be after start time",
      path: ["endTime"],
    }
  );

// Query appointments validation schema
export const queryAppointmentsSchema = z
  .object({
    doctorId: uuidSchema.optional(),
    patientId: uuidSchema.optional(),
    status: z
      .enum([
        AppointmentStatus.SCHEDULED,
        AppointmentStatus.CONFIRMED,
        AppointmentStatus.IN_PROGRESS,
        AppointmentStatus.COMPLETED,
        AppointmentStatus.CANCELLED,
        AppointmentStatus.NO_SHOW,
      ])
      .optional(),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be in YYYY-MM-DD format")
      .optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be in YYYY-MM-DD format")
      .optional(),
    page: z
      .string()
      .transform(Number)
      .refine((n) => n > 0, "Page must be greater than 0")
      .default(1),
    limit: z
      .string()
      .transform(Number)
      .refine((n) => n > 0 && n <= 100, "Limit must be between 1 and 100")
      .default(20),
    sortBy: z.enum(["appointmentDate", "createdAt", "status"]).default("appointmentDate"),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
  })
  .refine(
    (data) => {
      // If both dates are provided, validate date range
      if (data.startDate && data.endDate) {
        return new Date(data.startDate) <= new Date(data.endDate);
      }
      return true;
    },
    {
      message: "End date must be after or equal to start date",
      path: ["endDate"],
    }
  );

// Appointment status update validation schema
export const updateAppointmentStatusSchema = z.object({
  status: z.enum([
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.IN_PROGRESS,
    AppointmentStatus.COMPLETED,
    AppointmentStatus.NO_SHOW,
  ]),
  notes: z.string().max(1000, "Status update notes cannot exceed 1000 characters").optional(),
});

// URL parameter validation schemas
export const appointmentIdParamSchema = z.object({
  id: uuidSchema,
});

export const doctorIdParamSchema = z.object({
  doctorId: uuidSchema,
});

export const patientIdParamSchema = z.object({
  patientId: uuidSchema,
});

// Available slots query schema
export const availableSlotsSchema = z.object({
  doctorId: uuidSchema,
  date: dateSchema,
  duration: z
    .string()
    .transform(Number)
    .refine((n) => n >= 15 && n <= 240, "Duration must be between 15 and 240 minutes")
    .default(30),
});

// Next available slot query schema
export const nextAvailableSlotSchema = z.object({
  doctorId: uuidSchema,
  startDate: dateSchema.optional(),
  duration: z
    .string()
    .transform(Number)
    .refine((n) => n >= 15 && n <= 240, "Duration must be between 15 and 240 minutes")
    .default(30),
  maxDays: z
    .string()
    .transform(Number)
    .refine((n) => n >= 1 && n <= 90, "Max days must be between 1 and 90")
    .default(30),
});

// Helper function to convert time string to minutes
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours! * 60 + minutes!;
}

// Custom validation functions
export const validateAppointmentAccess = (
  appointmentUserId: string,
  currentUserId: string,
  currentUserRole: string
): boolean => {
  // Admins can access all appointments
  if (currentUserRole === "admin") {
    return true;
  }

  // Users can only access their own appointments
  return appointmentUserId === currentUserId;
};

export const validateAppointmentModification = (
  appointment: any,
  currentUserId: string,
  currentUserRole: string
): boolean => {
  // Admins can modify all appointments
  if (currentUserRole === "admin") {
    return true;
  }

  // Doctors can modify their own appointments
  if (currentUserRole === "doctor" && appointment.doctorId === currentUserId) {
    return true;
  }

  // Patients can modify their own appointments (with restrictions)
  if (currentUserRole === "patient" && appointment.patientId === currentUserId) {
    // Patients can only modify future appointments that are not confirmed
    const appointmentDateTime = new Date(`${appointment.appointmentDate}T${appointment.startTime}`);
    const now = new Date();

    return (
      appointmentDateTime > now &&
      appointment.status !== AppointmentStatus.CONFIRMED &&
      appointment.status !== AppointmentStatus.IN_PROGRESS &&
      appointment.status !== AppointmentStatus.COMPLETED
    );
  }

  return false;
};

// Business hours validation
export const validateBusinessHours = (startTime: string, endTime: string): boolean => {
  const businessStart = 8 * 60; // 8:00 AM
  const businessEnd = 18 * 60; // 6:00 PM

  const appointmentStart = timeToMinutes(startTime);
  const appointmentEnd = timeToMinutes(endTime);

  return appointmentStart >= businessStart && appointmentEnd <= businessEnd;
};
