import swaggerJsdoc from "swagger-jsdoc";
import { config } from "@/shared/config/environment";

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: config.app.name,
    version: "1.0.0",
    description: "Multi-tenant doctor appointment booking system API",
    contact: {
      name: "API Support",
      email: "support@doctorappointment.com",
    },
    license: {
      name: "MIT",
      url: "https://opensource.org/licenses/MIT",
    },
  },
  servers: [
    {
      url: config.app.isDevelopment
        ? `http://localhost:${config.app.port}/api/${config.app.apiVersion}`
        : `https://api.doctorappointment.com/api/${config.app.apiVersion}`,
      description: config.app.isDevelopment ? "Development server" : "Production server",
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Enter JWT token obtained from login endpoint",
      },
    },
    parameters: {
      TenantId: {
        in: "header",
        name: "X-Tenant-ID",
        schema: {
          type: "string",
          format: "uuid",
        },
        required: true,
        description: "Tenant identifier",
      },
      TenantSubdomain: {
        in: "header",
        name: "X-Tenant-Subdomain",
        schema: {
          type: "string",
        },
        required: false,
        description: "Tenant subdomain (alternative to Tenant ID)",
      },
    },
    schemas: {
      ApiResponse: {
        type: "object",
        properties: {
          success: {
            type: "boolean",
            description: "Indicates if the request was successful",
          },
          data: {
            type: "object",
            description: "Response data (if any)",
          },
          message: {
            type: "string",
            description: "Human-readable message",
          },
          errors: {
            type: "array",
            items: {
              $ref: "#/components/schemas/ValidationError",
            },
            description: "Validation errors (if any)",
          },
          meta: {
            $ref: "#/components/schemas/PaginationMeta",
            description: "Pagination metadata (for paginated responses)",
          },
        },
        required: ["success"],
      },
      ValidationError: {
        type: "object",
        properties: {
          field: {
            type: "string",
            description: "Field that failed validation",
          },
          message: {
            type: "string",
            description: "Validation error message",
          },
          code: {
            type: "string",
            description: "Error code",
          },
        },
        required: ["field", "message"],
      },
      PaginationMeta: {
        type: "object",
        properties: {
          page: {
            type: "integer",
            description: "Current page number",
          },
          limit: {
            type: "integer",
            description: "Number of items per page",
          },
          total: {
            type: "integer",
            description: "Total number of items",
          },
          totalPages: {
            type: "integer",
            description: "Total number of pages",
          },
          hasNextPage: {
            type: "boolean",
            description: "Whether there is a next page",
          },
          hasPreviousPage: {
            type: "boolean",
            description: "Whether there is a previous page",
          },
        },
        required: ["page", "limit", "total", "totalPages", "hasNextPage", "hasPreviousPage"],
      },
      User: {
        type: "object",
        properties: {
          id: {
            type: "string",
            format: "uuid",
            description: "User unique identifier",
          },
          email: {
            type: "string",
            format: "email",
            description: "User email address",
          },
          firstName: {
            type: "string",
            description: "User first name",
          },
          lastName: {
            type: "string",
            description: "User last name",
          },
          role: {
            type: "string",
            enum: ["admin", "doctor", "patient"],
            description: "User role",
          },
          tenantId: {
            type: "string",
            format: "uuid",
            description: "Tenant identifier",
          },
          isActive: {
            type: "boolean",
            description: "Whether user account is active",
          },
          isVerified: {
            type: "boolean",
            description: "Whether user email is verified",
          },
          lastLoginAt: {
            type: "string",
            format: "date-time",
            description: "Last login timestamp",
          },
          createdAt: {
            type: "string",
            format: "date-time",
            description: "Account creation timestamp",
          },
          updatedAt: {
            type: "string",
            format: "date-time",
            description: "Last update timestamp",
          },
        },
        required: ["id", "email", "firstName", "lastName", "role", "tenantId", "isActive", "isVerified"],
      },
      AuthResponse: {
        type: "object",
        properties: {
          user: {
            $ref: "#/components/schemas/User",
          },
          accessToken: {
            type: "string",
            description: "JWT access token",
          },
          refreshToken: {
            type: "string",
            description: "JWT refresh token",
          },
          expiresIn: {
            type: "integer",
            description: "Token expiration time in seconds",
          },
        },
        required: ["user", "accessToken", "refreshToken", "expiresIn"],
      },
      UserSession: {
        type: "object",
        properties: {
          id: {
            type: "string",
            format: "uuid",
            description: "Session unique identifier",
          },
          userId: {
            type: "string",
            format: "uuid",
            description: "User identifier",
          },
          tenantId: {
            type: "string",
            format: "uuid",
            description: "Tenant identifier",
          },
          role: {
            type: "string",
            enum: ["admin", "doctor", "patient"],
            description: "User role",
          },
          isActive: {
            type: "boolean",
            description: "Whether session is active",
          },
          createdAt: {
            type: "string",
            format: "date-time",
            description: "Session creation timestamp",
          },
          lastActivityAt: {
            type: "string",
            format: "date-time",
            description: "Last activity timestamp",
          },
          ipAddress: {
            type: "string",
            description: "IP address of the session",
          },
          userAgent: {
            type: "string",
            description: "User agent string",
          },
        },
        required: ["id", "userId", "tenantId", "role", "isActive", "createdAt", "lastActivityAt"],
      },
      Appointment: {
        type: "object",
        properties: {
          id: {
            type: "string",
            format: "uuid",
            description: "Appointment unique identifier",
          },
          doctorId: {
            type: "string",
            format: "uuid",
            description: "Doctor identifier",
          },
          patientId: {
            type: "string",
            format: "uuid",
            description: "Patient identifier",
          },
          tenantId: {
            type: "string",
            format: "uuid",
            description: "Tenant identifier",
          },
          appointmentDate: {
            type: "string",
            format: "date",
            description: "Appointment date",
          },
          startTime: {
            type: "string",
            pattern: "^([01]?[0-9]|2[0-3]):[0-5][0-9]$",
            description: "Appointment start time (HH:mm)",
            example: "14:30",
          },
          endTime: {
            type: "string",
            pattern: "^([01]?[0-9]|2[0-3]):[0-5][0-9]$",
            description: "Appointment end time (HH:mm)",
            example: "15:00",
          },
          status: {
            type: "string",
            enum: ["scheduled", "confirmed", "in_progress", "completed", "cancelled", "no_show"],
            description: "Appointment status",
          },
          reasonForVisit: {
            type: "string",
            description: "Reason for the appointment",
          },
          notes: {
            type: "string",
            description: "Appointment notes",
          },
          cancellationReason: {
            type: "string",
            description: "Reason for cancellation (if cancelled)",
          },
          cancelledBy: {
            type: "string",
            format: "uuid",
            description: "ID of user who cancelled the appointment",
          },
          cancelledAt: {
            type: "string",
            format: "date-time",
            description: "Cancellation timestamp",
          },
          confirmedAt: {
            type: "string",
            format: "date-time",
            description: "Confirmation timestamp",
          },
          createdAt: {
            type: "string",
            format: "date-time",
            description: "Creation timestamp",
          },
          updatedAt: {
            type: "string",
            format: "date-time",
            description: "Last update timestamp",
          },
        },
        required: ["id", "doctorId", "patientId", "tenantId", "appointmentDate", "startTime", "endTime", "status"],
      },
      CreateAppointmentRequest: {
        type: "object",
        properties: {
          doctorId: {
            type: "string",
            format: "uuid",
            description: "Doctor identifier",
          },
          patientId: {
            type: "string",
            format: "uuid",
            description: "Patient identifier (optional if current user is patient)",
          },
          appointmentDate: {
            type: "string",
            format: "date",
            description: "Appointment date",
          },
          startTime: {
            type: "string",
            pattern: "^([01]?[0-9]|2[0-3]):[0-5][0-9]$",
            description: "Appointment start time (HH:mm)",
            example: "14:30",
          },
          endTime: {
            type: "string",
            pattern: "^([01]?[0-9]|2[0-3]):[0-5][0-9]$",
            description: "Appointment end time (HH:mm)",
            example: "15:00",
          },
          reasonForVisit: {
            type: "string",
            description: "Reason for the appointment",
          },
        },
        required: ["doctorId", "appointmentDate", "startTime", "endTime"],
      },
    },
  },
  tags: [
    {
      name: "Authentication",
      description: "User authentication and session management",
    },
    {
      name: "Appointments",
      description: "Appointment management",
    },
    {
      name: "Doctors",
      description: "Doctor profiles and availability management",
    },
    {
      name: "Patients",
      description: "Patient profile management",
    },
    {
      name: "Medical Notes",
      description: "Medical notes and records",
    },
    {
      name: "Notifications",
      description: "Notification management",
    },
    {
      name: "Analytics",
      description: "Analytics and reporting",
    },
  ],
};

const options = {
  definition: swaggerDefinition,
  apis: ["./src/domains/**/*.ts", "./src/api/**/*.ts"],
};

export const createSwaggerSpec = () => {
  return swaggerJsdoc(options);
};
