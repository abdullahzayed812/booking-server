import { z } from "zod";

// Phone number validation schema
const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format")
  .optional();

// Blood type validation schema
const bloodTypeSchema = z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]).optional();

// UUID validation schema
const uuidSchema = z.string().uuid("Invalid UUID format");

// Create patient profile validation schema
export const createPatientProfileSchema = z.object({
  userId: uuidSchema,
  medicalRecordNumber: z.string().max(50, "Medical record number cannot exceed 50 characters").trim().optional(),
  emergencyContactName: z.string().max(255, "Emergency contact name cannot exceed 255 characters").trim().optional(),
  emergencyContactPhone: phoneSchema,
  bloodType: bloodTypeSchema,
  allergies: z.string().max(2000, "Allergies information cannot exceed 2000 characters").trim().optional(),
  medicalHistory: z.string().max(5000, "Medical history cannot exceed 5000 characters").trim().optional(),
});

// Update patient profile validation schema
export const updatePatientProfileSchema = z.object({
  medicalRecordNumber: z
    .string()
    .max(50, "Medical record number cannot exceed 50 characters")
    .trim()
    .optional()
    .nullable(),
  emergencyContactName: z
    .string()
    .max(255, "Emergency contact name cannot exceed 255 characters")
    .trim()
    .optional()
    .nullable(),
  emergencyContactPhone: phoneSchema.nullable(),
  bloodType: bloodTypeSchema.nullable(),
  allergies: z.string().max(2000, "Allergies information cannot exceed 2000 characters").trim().optional().nullable(),
  medicalHistory: z.string().max(5000, "Medical history cannot exceed 5000 characters").trim().optional().nullable(),
});

// Update emergency contact validation schema
export const updateEmergencyContactSchema = z.object({
  emergencyContactName: z
    .string()
    .min(1, "Emergency contact name is required")
    .max(255, "Emergency contact name cannot exceed 255 characters")
    .trim(),
  emergencyContactPhone: z
    .string()
    .min(1, "Emergency contact phone is required")
    .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format"),
});

// Update allergies validation schema
export const updateAllergiesSchema = z.object({
  allergies: z.string().max(2000, "Allergies information cannot exceed 2000 characters").trim(),
});

// Update medical history validation schema
export const updateMedicalHistorySchema = z.object({
  medicalHistory: z.string().max(5000, "Medical history cannot exceed 5000 characters").trim(),
});

// Query patients validation schema
export const queryPatientsSchema = z.object({
  isActive: z
    .string()
    .transform((val) => val === "true")
    .optional(),
  searchTerm: z
    .string()
    .min(2, "Search term must be at least 2 characters")
    .max(100, "Search term cannot exceed 100 characters")
    .trim()
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
  sortBy: z.enum(["firstName", "lastName", "email", "medicalRecordNumber", "createdAt"]).default("firstName"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

// Search patients validation schema
export const searchPatientsSchema = z.object({
  q: z
    .string()
    .min(2, "Search query must be at least 2 characters")
    .max(100, "Search query cannot exceed 100 characters")
    .trim(),
  limit: z
    .string()
    .transform(Number)
    .refine((n) => n > 0 && n <= 50, "Limit must be between 1 and 50")
    .default(20),
});

// Medical record number validation schema
export const medicalRecordNumberSchema = z.object({
  medicalRecordNumber: z
    .string()
    .min(1, "Medical record number is required")
    .max(50, "Medical record number cannot exceed 50 characters")
    .trim(),
});

// URL parameter validation schemas
export const patientIdParamSchema = z.object({
  id: uuidSchema,
});

// Custom validation functions
export const validatePatientAccess = (patientId: string, currentUserId: string, currentUserRole: string): boolean => {
  // Admins can access all patient profiles
  if (currentUserRole === "admin") {
    return true;
  }

  // Doctors can access patient profiles (for appointments/medical notes)
  if (currentUserRole === "doctor") {
    return true;
  }

  // Patients can only access their own profile
  if (currentUserRole === "patient" && patientId === currentUserId) {
    return true;
  }

  return false;
};

export const validatePatientModification = (
  patientId: string,
  currentUserId: string,
  currentUserRole: string
): boolean => {
  // Admins can modify all patient profiles
  if (currentUserRole === "admin") {
    return true;
  }

  // Patients can only modify their own profile
  if (currentUserRole === "patient" && patientId === currentUserId) {
    return true;
  }

  return false;
};

// Blood type validation
export const validBloodTypes = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

export const validateBloodType = (bloodType: string): boolean => {
  return validBloodTypes.includes(bloodType.toUpperCase() as any);
};

// Phone number validation
export const validatePhoneNumber = (phone: string): boolean => {
  // Remove common formatting characters
  const cleanPhone = phone.replace(/[\s\-\(\)\.]/g, "");

  // Basic international phone number format
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;

  return phoneRegex.test(cleanPhone);
};

// Medical record number validation
export const validateMedicalRecordNumber = (mrn: string): boolean => {
  // Basic alphanumeric validation - can be customized per organization
  const mrnRegex = /^[A-Za-z0-9\-\_]{1,50}$/;
  return mrnRegex.test(mrn);
};

// Emergency contact validation
export const validateEmergencyContact = (name: string, phone: string): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!name || name.trim().length === 0) {
    errors.push("Emergency contact name is required");
  } else if (name.length > 255) {
    errors.push("Emergency contact name cannot exceed 255 characters");
  }

  if (!phone || phone.trim().length === 0) {
    errors.push("Emergency contact phone is required");
  } else if (!validatePhoneNumber(phone)) {
    errors.push("Invalid emergency contact phone number format");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Allergy information validation
export const validateAllergies = (allergies: string): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (allergies.length > 2000) {
    errors.push("Allergies information cannot exceed 2000 characters");
  }

  // Check for potentially dangerous allergy entries
  const dangerousPatterns = [
    /script/i,
    /<[^>]*>/, // HTML tags
    /javascript/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(allergies)) {
      errors.push("Allergies information contains invalid characters");
      break;
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Medical history validation
export const validateMedicalHistory = (history: string): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (history.length > 5000) {
    errors.push("Medical history cannot exceed 5000 characters");
  }

  // Check for potentially dangerous content
  const dangerousPatterns = [
    /script/i,
    /<[^>]*>/, // HTML tags
    /javascript/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(history)) {
      errors.push("Medical history contains invalid characters");
      break;
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};
