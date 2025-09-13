import { z } from "zod";
import { DayOfWeek } from "@/shared/types/common.types";

// Time validation schema
const timeSchema = z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Time must be in HH:mm format");

// UUID validation schema
const uuidSchema = z.string().uuid("Invalid UUID format");

// Create doctor profile validation schema
export const createDoctorProfileSchema = z.object({
  userId: uuidSchema,
  specialization: z
    .string()
    .min(1, "Specialization is required")
    .max(255, "Specialization cannot exceed 255 characters")
    .trim(),
  licenseNumber: z.string().max(100, "License number cannot exceed 100 characters").trim().optional(),
  bio: z.string().max(2000, "Bio cannot exceed 2000 characters").trim().optional(),
  consultationFee: z
    .number()
    .min(0, "Consultation fee cannot be negative")
    .max(10000, "Consultation fee seems too high")
    .optional(),
  consultationDuration: z
    .number()
    .min(15, "Consultation duration must be at least 15 minutes")
    .max(240, "Consultation duration cannot exceed 4 hours")
    .optional(),
});

// Update doctor profile validation schema
export const updateDoctorProfileSchema = z.object({
  specialization: z
    .string()
    .min(1, "Specialization cannot be empty")
    .max(255, "Specialization cannot exceed 255 characters")
    .trim()
    .optional(),
  licenseNumber: z.string().max(100, "License number cannot exceed 100 characters").trim().optional().nullable(),
  bio: z.string().max(2000, "Bio cannot exceed 2000 characters").trim().optional().nullable(),
  consultationFee: z
    .number()
    .min(0, "Consultation fee cannot be negative")
    .max(10000, "Consultation fee seems too high")
    .optional()
    .nullable(),
  consultationDuration: z
    .number()
    .min(15, "Consultation duration must be at least 15 minutes")
    .max(240, "Consultation duration cannot exceed 4 hours")
    .optional(),
  isAcceptingAppointments: z.boolean().optional(),
});

// Weekly schedule slot validation schema
const weeklyScheduleSlotSchema = z
  .object({
    dayOfWeek: z.number().min(0, "Day of week must be 0-6").max(6, "Day of week must be 0-6"),
    startTime: timeSchema,
    endTime: timeSchema,
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

// Set weekly schedule validation schema
export const setWeeklyScheduleSchema = z.object({
  schedule: z
    .array(weeklyScheduleSlotSchema)
    .min(1, "At least one schedule slot is required")
    .max(21, "Maximum 3 slots per day for 7 days")
    .refine(
      (schedule) => {
        // Check for overlapping slots on the same day
        const daySlots = new Map<number, typeof schedule>();

        for (const slot of schedule) {
          if (!daySlots.has(slot.dayOfWeek)) {
            daySlots.set(slot.dayOfWeek, []);
          }
          daySlots.get(slot.dayOfWeek)!.push(slot);
        }

        for (const [day, slots] of daySlots.entries()) {
          if (slots.length > 1) {
            // Sort slots by start time
            slots.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

            // Check for overlaps
            for (let i = 0; i < slots.length - 1; i++) {
              const currentEnd = timeToMinutes(slots[i]!.endTime);
              const nextStart = timeToMinutes(slots[i + 1]!.startTime);

              if (currentEnd > nextStart) {
                return false;
              }
            }
          }
        }

        return true;
      },
      {
        message: "Overlapping time slots found on the same day",
      }
    ),
});

// Availability override validation schema
export const createAvailabilityOverrideSchema = z
  .object({
    date: z
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
      }, "Cannot create override for past dates"),
    startTime: timeSchema.optional(),
    endTime: timeSchema.optional(),
    isAvailable: z.boolean(),
    reason: z.string().max(500, "Reason cannot exceed 500 characters").trim().optional(),
  })
  .refine(
    (data) => {
      // If both times are provided, validate the range
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
  )
  .refine(
    (data) => {
      // For available overrides, times should be provided
      if (data.isAvailable && (!data.startTime || !data.endTime)) {
        return false;
      }
      return true;
    },
    {
      message: "Start time and end time are required for available overrides",
      path: ["startTime"],
    }
  );

// Query doctors validation schema
export const queryDoctorsSchema = z.object({
  specialization: z.string().trim().optional(),
  isAcceptingAppointments: z
    .string()
    .transform((val) => val === "true")
    .optional(),
  isActive: z
    .string()
    .transform((val) => val === "true")
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
  sortBy: z.enum(["firstName", "lastName", "specialization", "createdAt"]).default("firstName"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

// Get availability overrides validation schema
export const getAvailabilityOverridesSchema = z
  .object({
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be in YYYY-MM-DD format")
      .refine((dateStr) => {
        const date = new Date(dateStr);
        return !isNaN(date.getTime());
      }, "Invalid start date"),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be in YYYY-MM-DD format")
      .refine((dateStr) => {
        const date = new Date(dateStr);
        return !isNaN(date.getTime());
      }, "Invalid end date"),
  })
  .refine(
    (data) => {
      const startDate = new Date(data.startDate);
      const endDate = new Date(data.endDate);
      return startDate <= endDate;
    },
    {
      message: "End date must be after or equal to start date",
      path: ["endDate"],
    }
  )
  .refine(
    (data) => {
      const startDate = new Date(data.startDate);
      const endDate = new Date(data.endDate);
      const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= 90; // Maximum 90 days range
    },
    {
      message: "Date range cannot exceed 90 days",
      path: ["endDate"],
    }
  );

// URL parameter validation schemas
export const doctorIdParamSchema = z.object({
  id: uuidSchema,
});

export const overrideIdParamSchema = z.object({
  overrideId: uuidSchema,
});

// Availability slot validation schema
export const createAvailabilitySlotSchema = z
  .object({
    dayOfWeek: z.number().min(0, "Day of week must be 0-6").max(6, "Day of week must be 0-6"),
    startTime: timeSchema,
    endTime: timeSchema,
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

// Update availability slot validation schema
export const updateAvailabilitySlotSchema = z
  .object({
    startTime: timeSchema,
    endTime: timeSchema,
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

// Helper function to convert time string to minutes
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours! * 60 + minutes!;
}

// Custom validation functions
export const validateDoctorAccess = (doctorId: string, currentUserId: string, currentUserRole: string): boolean => {
  // Admins can access all doctor profiles
  if (currentUserRole === "admin") {
    return true;
  }

  // Doctors can access their own profile
  if (currentUserRole === "doctor" && doctorId === currentUserId) {
    return true;
  }

  // Patients and other users can read doctor profiles (public info)
  return true; // Reading doctor profiles is generally allowed
};

export const validateDoctorModification = (
  doctorId: string,
  currentUserId: string,
  currentUserRole: string
): boolean => {
  // Admins can modify all doctor profiles
  if (currentUserRole === "admin") {
    return true;
  }

  // Doctors can only modify their own profile
  if (currentUserRole === "doctor" && doctorId === currentUserId) {
    return true;
  }

  return false;
};

// Business hours validation
export const validateWorkingHours = (startTime: string, endTime: string): boolean => {
  const businessStart = 6 * 60; // 6:00 AM
  const businessEnd = 22 * 60; // 10:00 PM

  const appointmentStart = timeToMinutes(startTime);
  const appointmentEnd = timeToMinutes(endTime);

  return appointmentStart >= businessStart && appointmentEnd <= businessEnd;
};

// Specialization validation
export const commonSpecializations = [
  "General Practice",
  "Internal Medicine",
  "Cardiology",
  "Dermatology",
  "Endocrinology",
  "Gastroenterology",
  "Neurology",
  "Orthopedics",
  "Pediatrics",
  "Psychiatry",
  "Pulmonology",
  "Radiology",
  "Surgery",
  "Urology",
  "Oncology",
  "Ophthalmology",
  "ENT",
  "Anesthesiology",
  "Emergency Medicine",
  "Family Medicine",
];

export const validateSpecialization = (specialization: string): boolean => {
  // Allow custom specializations but warn if not common
  return specialization.length >= 2 && specialization.length <= 255;
};
